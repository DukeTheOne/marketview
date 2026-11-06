import { z } from 'zod';
import {
  WORKSPACE_QUOTAS,
  WorkspaceBackupSchema,
  garbageCollectWorkspace,
  serializeWorkspaceBackup,
  type WorkspaceBackup,
} from '../serialization/workspaceExport';

export const FirebaseConfigSchema = z.object({
  apiKey: z.string().trim().min(1, 'Firebase API Key cannot be empty'),
  projectId: z.string().trim().min(1, 'Firebase Project ID cannot be empty'),
});
export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>;

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyAsLizYjyI5w6ihubSHXg7Pjikd70daz64',
  projectId: 'marketview-10d3c',
};

export const CloudAuthSessionSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email(),
  idToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAtMs: z.number().int().positive(),
});
export type CloudAuthSession = z.infer<typeof CloudAuthSessionSchema>;

export interface CloudSyncResult {
  syncedAt: number;
  byteLength: number;
  skipped?: boolean;
}

export const MIN_SYNC_COOLDOWN_MS = 5_000;

function computeStringHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function computeUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  // Fallback utf-8 byte length computation
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Headless client for Firebase Authentication and single-document Firestore sync.
 * Interacts via standard REST endpoints with zero native Firebase SDK dependencies.
 */
export class FirebaseSyncClient {
  private readonly config: FirebaseConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly minCooldownMs: number;
  private lastPushTimeMs: number | null = null;
  private lastPushedHash: string | null = null;
  private lastSyncedAt: number | null = null;

  public constructor(
    config: FirebaseConfig,
    options?: {
      fetchImpl?: typeof fetch;
      minCooldownMs?: number;
    }
  ) {
    this.config = FirebaseConfigSchema.parse(config);
    this.fetchImpl =
      options?.fetchImpl ??
      ((input: RequestInfo | URL, init?: RequestInit) =>
        globalThis.fetch(input, init));
    this.minCooldownMs = options?.minCooldownMs ?? MIN_SYNC_COOLDOWN_MS;
  }

  public getLastPushTime(): number | null {
    return this.lastPushTimeMs;
  }

  public getLastPushedHash(): string | null {
    return this.lastPushedHash;
  }

  /**
   * Signs up a new user using Firebase Identity Toolkit REST API.
   */
  public async signUpWithEmail(
    email: string,
    pass: string
  ): Promise<CloudAuthSession> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (cleanPass.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
      this.config.apiKey
    )}`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPass,
        returnSecureToken: true,
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        ((data?.error as Record<string, unknown> | undefined)?.message as string) ||
        'Failed to sign up';
      throw new Error(this.humanizeAuthError(errMsg));
    }

    const expiresInSec = Number(data.expiresIn) || 3600;
    return CloudAuthSessionSchema.parse({
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    });
  }

  /**
   * Signs in an existing user using Firebase Identity Toolkit REST API.
   */
  public async signInWithEmail(
    email: string,
    pass: string
  ): Promise<CloudAuthSession> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
      this.config.apiKey
    )}`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPass,
        returnSecureToken: true,
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        ((data?.error as Record<string, unknown> | undefined)?.message as string) ||
        'Failed to sign in';
      throw new Error(this.humanizeAuthError(errMsg));
    }

    const expiresInSec = Number(data.expiresIn) || 3600;
    return CloudAuthSessionSchema.parse({
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    });
  }

  /**
   * Exchanges a Google OAuth id_token or access_token for a Firebase CloudAuthSession
   * using the Identity Toolkit accounts:signInWithIdp REST endpoint.
   */
  public async signInWithGoogleIdp(
    credential: { idToken?: string; accessToken?: string },
    requestUri = 'http://localhost'
  ): Promise<CloudAuthSession> {
    if (!credential.idToken && !credential.accessToken) {
      throw new Error('Google ID token or access token is required');
    }

    const tokenParam = credential.idToken
      ? `id_token=${encodeURIComponent(credential.idToken)}`
      : `access_token=${encodeURIComponent(credential.accessToken!)}`;

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
      this.config.apiKey
    )}`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `${tokenParam}&providerId=google.com`,
        requestUri,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        ((data?.error as Record<string, unknown> | undefined)?.message as string) ||
        'Failed to sign in with Google';
      throw new Error(this.humanizeAuthError(errMsg));
    }

    const expiresInSec = Number(data.expiresIn) || 3600;
    return CloudAuthSessionSchema.parse({
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    });
  }

  /**
   * Refreshes an expired ID token using the user's refresh token.
   */
  public async refreshSession(
    session: CloudAuthSession
  ): Promise<CloudAuthSession> {
    const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(
      this.config.apiKey
    )}`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(
        session.refreshToken
      )}`,
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error('Failed to refresh cloud session. Please sign in again.');
    }

    const expiresInSec = Number(data.expires_in) || 3600;
    return CloudAuthSessionSchema.parse({
      uid: data.user_id || session.uid,
      email: session.email,
      idToken: data.id_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    });
  }

  /**
   * Pulls the user's single workspace document from Firestore.
   * Returns null if no cloud workspace document exists yet (HTTP 404).
   */
  public async pullWorkspace(
    session: CloudAuthSession
  ): Promise<WorkspaceBackup | null> {
    const docUrl = this.getWorkspaceDocumentUrl(session.uid);
    const res = await this.fetchImpl(docUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`Failed to pull cloud workspace (HTTP ${res.status}): ${bodyText}`);
    }

    const doc = (await res.json()) as {
      fields?: {
        payloadJson?: { stringValue?: string };
      };
    };

    const payloadJson = doc?.fields?.payloadJson?.stringValue;
    if (!payloadJson) {
      return null;
    }

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(payloadJson);
    } catch {
      throw new Error('Remote cloud workspace contains corrupt JSON payload');
    }

    return WorkspaceBackupSchema.parse(parsedRaw);
  }

  /**
   * Validates, garbage-collects, and pushes a workspace snapshot to Firestore.
   * Enforces 150 KB anti-bombing cap, cooldown rate limits, and hash deduplication.
   */
  public async pushWorkspace(
    session: CloudAuthSession,
    snapshot: WorkspaceBackup,
    options?: { force?: boolean }
  ): Promise<CloudSyncResult> {
    const cleanSnapshot = garbageCollectWorkspace(snapshot);
    const serialized = serializeWorkspaceBackup(cleanSnapshot);
    const byteLength = computeUtf8ByteLength(serialized);

    if (byteLength > WORKSPACE_QUOTAS.MAX_WORKSPACE_BYTES) {
      throw new Error(
        `Workspace size (${byteLength} bytes) exceeds maximum quota of ${WORKSPACE_QUOTAS.MAX_WORKSPACE_BYTES} bytes. Please remove some items.`
      );
    }

    const contentHash = computeStringHash(serialized);
    const now = Date.now();

    // Skip redundant push if payload is unchanged
    if (
      !options?.force &&
      this.lastPushedHash === contentHash &&
      this.lastSyncedAt !== null
    ) {
      return {
        syncedAt: this.lastSyncedAt,
        byteLength,
        skipped: true,
      };
    }

    // Cooldown check
    if (
      !options?.force &&
      this.lastPushTimeMs !== null &&
      now - this.lastPushTimeMs < this.minCooldownMs
    ) {
      const remainingSec = Math.ceil(
        (this.minCooldownMs - (now - this.lastPushTimeMs)) / 1000
      );
      throw new Error(
        `Sync cooldown active. Please wait ${remainingSec}s before syncing again.`
      );
    }

    const nowSec = Math.floor(now / 1000);
    const maskParams = [
      'updateMask.fieldPaths=payloadJson',
      'updateMask.fieldPaths=updatedAt',
      'updateMask.fieldPaths=byteLength',
      'updateMask.fieldPaths=version',
    ].join('&');
    const docUrl = `${this.getWorkspaceDocumentUrl(session.uid)}?${maskParams}`;

    const res = await this.fetchImpl(docUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          payloadJson: { stringValue: serialized },
          updatedAt: { integerValue: String(nowSec) },
          byteLength: { integerValue: String(byteLength) },
          version: { integerValue: '1' },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to push cloud workspace (HTTP ${res.status}): ${errText}`);
    }

    this.lastPushTimeMs = Date.now();
    this.lastPushedHash = contentHash;
    this.lastSyncedAt = nowSec;

    return {
      syncedAt: nowSec,
      byteLength,
      skipped: false,
    };
  }

  /**
   * Permanently deletes the user's workspace document from Firestore.
   */
  public async deleteWorkspaceVault(session: CloudAuthSession): Promise<void> {
    const docUrl = this.getWorkspaceDocumentUrl(session.uid);
    const res = await this.fetchImpl(docUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.idToken}`,
      },
    });

    if (!res.ok && res.status !== 404) {
      const errText = await res.text();
      throw new Error(
        `Failed to delete cloud vault (HTTP ${res.status}): ${errText}`
      );
    }

    this.lastPushTimeMs = null;
    this.lastPushedHash = null;
    this.lastSyncedAt = null;
  }

  private getWorkspaceDocumentUrl(uid: string): string {
    const safeProject = encodeURIComponent(this.config.projectId);
    const safeUid = encodeURIComponent(uid);
    return `https://firestore.googleapis.com/v1/projects/${safeProject}/databases/(default)/documents/workspaces/${safeUid}`;
  }

  private humanizeAuthError(code: string): string {
    if (code.includes('EMAIL_EXISTS')) {
      return 'An account with this email already exists. Try signing in.';
    }
    if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('EMAIL_NOT_FOUND') || code.includes('INVALID_PASSWORD')) {
      return 'Invalid email or password.';
    }
    if (code.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
      return 'Too many attempts. Access temporarily blocked. Try again later.';
    }
    if (code.includes('USER_DISABLED')) {
      return 'This user account has been disabled.';
    }
    return code;
  }
}

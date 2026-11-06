import {
  CloudAuthSessionSchema,
  type CloudAuthSession,
  type FirebaseConfig,
} from '../../core/sync/firebaseSync';

const FIREBASE_APP_CDN =
  'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
const FIREBASE_AUTH_CDN =
  'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

interface FirebaseAppModule {
  getApps: () => Array<{ name: string }>;
  getApp: (name?: string) => unknown;
  initializeApp: (
    options: {
      apiKey: string;
      authDomain: string;
      projectId: string;
    },
    name?: string
  ) => unknown;
}

interface FirebaseUser {
  uid: string;
  email: string | null;
  refreshToken: string;
  getIdToken: () => Promise<string>;
}

interface FirebaseAuthModule {
  getAuth: (app?: unknown) => unknown;
  GoogleAuthProvider: new () => {
    setCustomParameters: (params: Record<string, string>) => void;
  };
  signInWithPopup: (
    auth: unknown,
    provider: unknown
  ) => Promise<{
    user: FirebaseUser;
  }>;
}

let cachedSdkPromise: Promise<[FirebaseAppModule, FirebaseAuthModule]> | null =
  null;

/**
 * Preloads the lightweight Firebase Auth ESM modules from Google's official gstatic CDN
 * when the Sync popover opens so `signInWithPopup` executes immediately on user click
 * without triggering browser popup blockers.
 */
export function preloadGoogleAuthSdk(): Promise<
  [FirebaseAppModule, FirebaseAuthModule]
> {
  if (!cachedSdkPromise) {
    cachedSdkPromise = Promise.all([
      import(/* @vite-ignore */ FIREBASE_APP_CDN) as Promise<FirebaseAppModule>,
      import(
        /* @vite-ignore */ FIREBASE_AUTH_CDN
      ) as Promise<FirebaseAuthModule>,
    ]).catch((err) => {
      cachedSdkPromise = null;
      throw err;
    });
  }
  return cachedSdkPromise;
}

function humanizeGooglePopupError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Google Sign-In popup was closed before completing.';
  }
  if (raw.includes('auth/cancelled-popup-request')) {
    return 'Previous sign-in popup was cancelled.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Popup was blocked by the browser. Please allow popups for this site and try again.';
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Google Sign-In is not enabled in your Firebase project yet. Go to Firebase Console → Authentication → Sign-in method → Enable Google.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    const host =
      typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Domain "${host}" is not authorized yet. Add "${host}" in Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  return raw;
}

/**
 * Opens a 1-click Google OAuth popup backed by the Firebase project's built-in
 * auth handler (`<projectId>.firebaseapp.com/__/auth/handler`) and returns
 * a validated CloudAuthSession.
 */
export async function signInWithGooglePopup(
  config: FirebaseConfig
): Promise<CloudAuthSession> {
  try {
    const [firebaseApp, firebaseAuth] = await preloadGoogleAuthSdk();
    const appName = `marketview-${config.projectId}`;
    const existingApps = firebaseApp.getApps();
    const app = existingApps.some((a) => a.name === appName)
      ? firebaseApp.getApp(appName)
      : firebaseApp.initializeApp(
          {
            apiKey: config.apiKey,
            authDomain: `${config.projectId}.firebaseapp.com`,
            projectId: config.projectId,
          },
          appName
        );

    const auth = firebaseAuth.getAuth(app);
    const provider = new firebaseAuth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await firebaseAuth.signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    const email =
      result.user.email || `${result.user.uid.slice(0, 8)}@google.user`;

    return CloudAuthSessionSchema.parse({
      uid: result.user.uid,
      email,
      idToken,
      refreshToken: result.user.refreshToken,
      expiresAtMs: Date.now() + 3600 * 1000,
    });
  } catch (err) {
    throw new Error(humanizeGooglePopupError(err));
  }
}

import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Download,
  Key,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { WORKSPACE_QUOTAS } from '../../core/serialization/workspaceExport';
import {
  DEFAULT_FIREBASE_CONFIG,
  type FirebaseConfig,
  type CloudAuthSession,
} from '../../core/sync/firebaseSync';
import type { UserPreferences } from '../../core/schemas/preferences';
import { preloadGoogleAuthSdk } from './googlePopupAuth';

export interface EntityCounts {
  watchlists: number;
  annotations: number;
  trades: number;
  alerts: number;
  tombstones: number;
}

export interface CloudSyncPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  authSession: CloudAuthSession | null;
  preferences: UserPreferences;
  currentWorkspaceBytes: number;
  entityCounts: EntityCounts;
  isSyncing: boolean;
  syncError: string | null;
  onSignIn: (email: string, pass: string, config: FirebaseConfig) => Promise<void>;
  onSignUp: (email: string, pass: string, config: FirebaseConfig) => Promise<void>;
  onSignInWithGoogle?: (config: FirebaseConfig) => Promise<void>;
  onSignOut: () => void;
  onSyncNow: () => Promise<void>;
  onDeleteCloudVault: () => Promise<void>;
  onExportLocalJson: () => void;
  onImportLocalJson: (file: File) => Promise<void>;
  onUpdateFirebaseConfig: (config: FirebaseConfig) => void;
}

export function CloudSyncPopover({
  isOpen,
  onClose,
  authSession,
  preferences,
  currentWorkspaceBytes,
  entityCounts,
  isSyncing,
  syncError,
  onSignIn,
  onSignUp,
  onSignInWithGoogle,
  onSignOut,
  onSyncNow,
  onDeleteCloudVault,
  onExportLocalJson,
  onImportLocalJson,
  onUpdateFirebaseConfig,
}: CloudSyncPopoverProps) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showConfigAccordion, setShowConfigAccordion] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // Fallback to Vite env variables, then pre-configured MarketView project
  const defaultApiKey =
    preferences.firebaseApiKey ||
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
    DEFAULT_FIREBASE_CONFIG.apiKey;
  const defaultProjectId =
    preferences.firebaseProjectId ||
    (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ||
    DEFAULT_FIREBASE_CONFIG.projectId;

  const [apiKeyInput, setApiKeyInput] = useState(defaultApiKey);
  const [projectIdInput, setProjectIdInput] = useState(defaultProjectId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && !authSession && typeof window !== 'undefined') {
      void preloadGoogleAuthSdk().catch(() => {
        // Ignore background preload errors when offline
      });
    }
  }, [isOpen, authSession]);

  if (!isOpen) {
    return null;
  }

  const effectiveError = syncError || localError;

  const resolveActiveConfig = (): FirebaseConfig | null => {
    const config: FirebaseConfig = {
      apiKey: apiKeyInput.trim() || defaultApiKey,
      projectId: projectIdInput.trim() || defaultProjectId,
    };
    if (!config.apiKey || !config.projectId) {
      setLocalError(
        'Firebase API Key and Project ID are required. Expand "Firebase Project Credentials" below to configure.'
      );
      setShowConfigAccordion(true);
      return null;
    }
    return config;
  };

  const handleGoogleSignIn = async () => {
    if (!onSignInWithGoogle) return;
    setLocalError(null);
    const config = resolveActiveConfig();
    if (!config) return;

    setIsGoogleSubmitting(true);
    try {
      await onSignInWithGoogle(config);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const config = resolveActiveConfig();
    if (!config) return;

    setIsSubmitting(true);
    try {
      if (authMode === 'signin') {
        await onSignIn(email, password, config);
      } else {
        await onSignUp(email, password, config);
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveConfig = (e: FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim() || !projectIdInput.trim()) {
      setLocalError('Both API Key and Project ID must be provided.');
      return;
    }
    onUpdateFirebaseConfig({
      apiKey: apiKeyInput.trim(),
      projectId: projectIdInput.trim(),
    });
    setLocalError(null);
    setConfigSuccessMsg('Firebase project credentials saved!');
    setTimeout(() => setConfigSuccessMsg(null), 3000);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await onImportLocalJson(file);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
      // Reset file input so user can import same file again if desired
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const maxBytes = WORKSPACE_QUOTAS.MAX_WORKSPACE_BYTES;
  const usagePercent = Math.min(
    100,
    Math.round((currentWorkspaceBytes / maxBytes) * 100)
  );

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    const elapsedSec = Math.floor(Date.now() / 1000) - timestamp;
    if (elapsedSec < 10) return 'Just now';
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) return `${elapsedMin}m ago`;
    const elapsedHours = Math.floor(elapsedMin / 60);
    return `${elapsedHours}h ago`;
  };

  return (
    <div
      data-testid="cloud-sync-popover"
      className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 overflow-hidden flex flex-col text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
        <div className="flex items-center gap-2">
          {authSession ? (
            <Cloud className="h-4 w-4 text-emerald-400" />
          ) : (
            <CloudOff className="h-4 w-4 text-slate-400" />
          )}
          <h3 className="text-sm font-bold text-white">Cloud Sync & Vault</h3>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
              authSession
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {authSession ? 'Connected' : 'Guest (Offline)'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cloud sync popover"
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error / Notice Banner */}
      {effectiveError && (
        <div
          data-testid="sync-error-banner"
          className="flex items-start gap-2 border-b border-rose-500/30 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-rose-200">Notice:</span>{' '}
            <span>{effectiveError}</span>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {configSuccessMsg && (
        <div className="flex items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs text-emerald-300">
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>{configSuccessMsg}</span>
        </div>
      )}

      <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4">
        {authSession ? (
          /* ================= Authenticated State ================= */
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-200">
                    {authSession.email}
                  </div>
                  <div className="truncate font-mono text-[10px] text-slate-500">
                    UID: {authSession.uid.slice(0, 12)}...
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out of Firebase cloud sync"
                className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:border-slate-700 hover:text-white"
              >
                <LogOut className="h-3 w-3" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Storage Quota Usage Card */}
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Cloud Vault Quota</span>
                <span className="font-mono font-medium text-slate-200">
                  {(currentWorkspaceBytes / 1024).toFixed(1)} KB /{' '}
                  {(maxBytes / 1024).toFixed(0)} KB ({usagePercent}%)
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    usagePercent > 90
                      ? 'bg-rose-500'
                      : usagePercent > 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(2, usagePercent)}%` }}
                />
              </div>

              {/* Entity Breakdown */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 font-mono text-[11px] text-slate-400">
                <div>
                  Watchlists:{' '}
                  <span className="text-slate-200 font-semibold">
                    {entityCounts.watchlists}
                  </span>
                  /{WORKSPACE_QUOTAS.MAX_WATCHLISTS}
                </div>
                <div>
                  Annotations:{' '}
                  <span className="text-slate-200 font-semibold">
                    {entityCounts.annotations}
                  </span>
                  /{WORKSPACE_QUOTAS.MAX_ANNOTATIONS}
                </div>
                <div>
                  Trades:{' '}
                  <span className="text-slate-200 font-semibold">
                    {entityCounts.trades}
                  </span>
                  /{WORKSPACE_QUOTAS.MAX_TRADES}
                </div>
                <div>
                  Alerts:{' '}
                  <span className="text-slate-200 font-semibold">
                    {entityCounts.alerts}
                  </span>
                  /{WORKSPACE_QUOTAS.MAX_ALERTS}
                </div>
              </div>
            </div>

            {/* Sync Now Action */}
            <div className="space-y-1.5">
              <button
                type="button"
                data-testid="sync-now-btn"
                disabled={isSyncing}
                onClick={() => void onSyncNow()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
              <div className="flex justify-between px-1 text-[11px] text-slate-500">
                <span>Last Cloud Sync:</span>
                <span className="font-mono text-slate-400">
                  {formatLastSync(preferences.lastCloudSyncTimestamp)}
                </span>
              </div>
            </div>

            {/* Cloud Vault Danger Zone */}
            <div className="border-t border-slate-800/80 pt-3">
              {showDeleteConfirm ? (
                <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>Delete Cloud Vault?</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Permanently deletes your single cloud document on Firestore.
                    Your local IndexedDB state will NOT be touched.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="confirm-delete-cloud-vault-btn"
                      onClick={async () => {
                        await onDeleteCloudVault();
                        setShowDeleteConfirm(false);
                      }}
                      className="flex-1 rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-500"
                    >
                      Yes, Delete Vault
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="delete-cloud-vault-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-rose-400/80 hover:text-rose-300 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Cloud Vault Document</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ================= Unauthenticated Guest State ================= */
          <div className="space-y-3.5">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 space-y-1">
              <span className="font-semibold text-emerald-400">
                100% Free Forever ($0/month):
              </span>
              <p className="text-slate-400 text-[11px]">
                Your data is stored safely in your browser. Sign in to sync your
                watchlists, notes, and drawings across any device.
              </p>
            </div>

            {/* 1-Click Google Sign-In Button */}
            {onSignInWithGoogle && (
              <>
                <button
                  type="button"
                  data-testid="google-signin-btn"
                  disabled={isGoogleSubmitting || isSubmitting}
                  onClick={() => void handleGoogleSignIn()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-700 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                >
                  {isGoogleSubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-700" />
                  ) : (
                    <svg
                      className="h-4 w-4 shrink-0"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span>
                    {isGoogleSubmitting
                      ? 'Connecting to Google...'
                      : 'Continue with Google'}
                  </span>
                </button>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-slate-800" />
                  <span className="mx-2 shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    or email & password
                  </span>
                  <div className="flex-grow border-t border-slate-800" />
                </div>
              </>
            )}

            {/* Auth Mode Toggle */}
            <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setLocalError(null);
                }}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                  authMode === 'signin'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setLocalError(null);
                }}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                  authMode === 'signup'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Sign In / Sign Up Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@example.com"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                <span>
                  {authMode === 'signin' ? 'Sign In to Sync' : 'Create Free Account'}
                </span>
              </button>
            </form>

            {/* Collapsible Firebase Project Config */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/50">
              <button
                type="button"
                onClick={() => setShowConfigAccordion((prev) => !prev)}
                className="flex w-full items-center justify-between p-2.5 text-left text-[11px] font-medium text-slate-400 hover:text-slate-200"
              >
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-slate-500" />
                  <span>Firebase Project Credentials</span>
                </div>
                {showConfigAccordion ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {showConfigAccordion && (
                <form
                  onSubmit={handleSaveConfig}
                  className="space-y-2.5 border-t border-slate-800 p-2.5"
                >
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Pre-configured with default MarketView cloud vault. You can
                    optionally override with your own Firebase project keys:
                  </p>
                  <div>
                    <label className="text-[10px] font-medium text-slate-400">
                      API Key
                    </label>
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-400">
                      Project ID
                    </label>
                    <input
                      type="text"
                      value={projectIdInput}
                      onChange={(e) => setProjectIdInput(e.target.value)}
                      placeholder="marketview-app"
                      className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded bg-slate-800 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                  >
                    Save Credentials
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Offline / Local Backup Section */}
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400">
            Offline Backup & Restore
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="export-json-btn"
              onClick={onExportLocalJson}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export .json</span>
            </button>

            <button
              type="button"
              data-testid="import-json-btn"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
              <span>Import .json</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

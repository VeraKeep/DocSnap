/**
 * SecureVaultConnectModal — explicit opt-in "Connect SecureVault" flow.
 *
 * Identity model: OPT-IN CONNECTED IDENTITY (owner decision). A DocSnap
 * (Clerk) user can choose to connect their SecureVault (Supabase) account so
 * they can push scanned documents into their vault. Nothing is sent to
 * SecureVault until the user both connects here AND taps "Save to Vault".
 *
 * Token capture (genuinely implementable today):
 *   - When VITE_SECUREVAULT_SUPABASE_URL / VITE_SECUREVAULT_SUPABASE_ANON_KEY
 *     are configured, the modal offers a real SecureVault sign-in (email +
 *     password). The credentials are POSTed straight to Supabase's auth
 *     endpoint (they never touch the DocSnap server); the resulting access
 *     token is sent to DocSnap's `/api/securevault/connect` once to be stored
 *     server-side.
 *   - A "paste your access token" fallback is always available (useful for
 *     testing and when the Supabase env isn't wired).
 *
 * Tradeoff (documented in docs/docsnap-securevault-integration.md):
 * a full OAuth (PKCE) redirect to SecureVault would be the friendliest UX, but
 * requires SecureVault to expose an OAuth client + callback that DocSnap can
 * register — not yet available. The embedded sign-in / token-paste below is the
 * implementable first slice; the stored token is identical either way.
 */
import { useState } from "react";
import type { ConnectInput } from "../hooks/useSecureVault";

interface Props {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  isConnecting: boolean;
  error: string | null;
  onConnect: (input: ConnectInput) => Promise<boolean>;
  onDisconnect: () => Promise<boolean>;
}

/** Supabase auth host for the embedded sign-in, from build-time env. */
const SUPABASE_URL = import.meta.env.VITE_SECUREVAULT_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SECUREVAULT_SUPABASE_ANON_KEY as string | undefined;
const SIGN_IN_AVAILABLE = !!SUPABASE_URL && !!SUPABASE_ANON;

async function signInWithSecureVault(email: string, password: string): Promise<ConnectInput> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error_description?: string; msg?: string };
    throw new Error(body.error_description ?? body.msg ?? `Sign-in failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string };
  };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    vaultUserId: data.user?.id,
  };
}

export function SecureVaultConnectModal({
  open,
  onClose,
  connected,
  isConnecting,
  error,
  onConnect,
  onDisconnect,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showTokenField, setShowTokenField] = useState(!SIGN_IN_AVAILABLE);

  if (!open) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const input = await signInWithSecureVault(email.trim(), password);
      await onConnect(input);
      onClose();
      setPassword("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const handlePasteToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!token.trim()) {
      setLocalError("Enter a SecureVault access token.");
      return;
    }
    const ok = await onConnect({ accessToken: token.trim() });
    if (ok) {
      setToken("");
      onClose();
    }
  };

  const handleDisconnect = async () => {
    setLocalError(null);
    await onDisconnect();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {connected ? "Your SecureVault connection" : "Connect your SecureVault vault"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 text-gray-400 hover:text-white">✕</button>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          Store your scanned documents in your SecureVault vault. Documents are only sent
          when you tap <span className="text-indigo-300">Save to Vault</span> afterwards —
          nothing leaves your device automatically.
        </p>

        {connected ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-green-600/40 bg-green-900/20 px-3 py-2 text-sm text-green-300">
              Connected. Your scans can be saved to SecureVault.
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="rounded-lg border border-red-500/50 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-950/40 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <>
            {SIGN_IN_AVAILABLE && !showTokenField && (
              <form onSubmit={handleSignIn} className="flex flex-col gap-3">
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="SecureVault email" disabled={isConnecting}
                  className="rounded-lg border border-gray-600 bg-gray-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                />
                <input
                  type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="SecureVault password" disabled={isConnecting}
                  className="rounded-lg border border-gray-600 bg-gray-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                />
                <button
                  type="submit" disabled={isConnecting}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {isConnecting ? "Connecting…" : "Sign in & connect"}
                </button>
                <p className="text-center text-xs text-gray-500">
                  <button type="button" className="underline hover:text-gray-300" onClick={() => setShowTokenField(true)}>
                    I already have an access token
                  </button>
                </p>
              </form>
            )}

            {showTokenField && (
              <form onSubmit={handlePasteToken} className="flex flex-col gap-3">
                <textarea
                  value={token} onChange={(e) => setToken(e.target.value)} rows={3} disabled={isConnecting}
                  placeholder="Paste your SecureVault access token…"
                  className="resize-none rounded-lg border border-gray-600 bg-gray-800 px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                />
                <button
                  type="submit" disabled={isConnecting}
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {isConnecting ? "Connecting…" : "Connect vault"}
                </button>
                {SIGN_IN_AVAILABLE && (
                  <p className="text-center text-xs text-gray-500">
                    <button type="button" className="underline hover:text-gray-300" onClick={() => setShowTokenField(false)}>
                      Back to sign-in
                    </button>
                  </p>
                )}
              </form>
            )}
          </>
        )}

        {(error || localError) && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {localError ?? error}
          </p>
        )}
      </div>
    </div>
  );
}

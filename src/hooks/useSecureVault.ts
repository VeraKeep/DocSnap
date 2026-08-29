/**
 * useSecureVault — client state + actions for the DocSnap ↔ SecureVault
 * connected-identity flow.
 *
 * PRIVACY PROMISE: everything here is opt-in and default-off. Nothing is sent
 * to SecureVault unless the user (1) explicitly connects their vault and
 * (2) explicitly taps "Save to Vault" on a scan.
 *
 * The browser ONLY ever POSTs the PDF blob to DocSnap's own server route
 * (which forwards it with the stored SecureVault token). The browser never
 * holds the SecureVault token — it is sent to `/api/securevault/connect`
 * once during connect and is never returned to the client afterwards.
 */
import { useCallback, useEffect, useState } from "react";

export interface VaultSaveResult {
  document_id: string;
  status?: {
    ocr_status: string | null;
    ai_status: string | null;
    source: string | null;
    source_ref: string | null;
  };
}

/** Request shape for `/api/securevault/connect`. */
export interface ConnectInput {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  vaultUserId?: string;
}

async function readJson<T>(res: Response): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  return { ok: res.ok, status: res.status, data };
}

export function useSecureVault() {
  /** true=connected, false=not connected, null=still loading the check. */
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<VaultSaveResult | null>(null);

  /** Check whether the current user has a stored SecureVault connection. */
  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/securevault");
      const { data } = await readJson<{ connected: boolean }>(res);
      setConnected(!!data.connected);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  /** Store the user's SecureVault token server-side (one-shot, create + signed-out clause safe). */
  const connectSecureVault = useCallback(
    async (input: ConnectInput): Promise<boolean> => {
      setIsConnecting(true);
      setConnectError(null);
      try {
        const res = await fetch("/api/securevault/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const { ok, data } = await readJson<{ connected: boolean }>(res);
        if (!ok) {
          setConnectError(data.error ?? "Could not connect your vault.");
          return false;
        }
        setConnected(true);
        return true;
      } catch {
        setConnectError("Could not reach the server. Please try again.");
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [],
  );

  /** Remove the stored connection. */
  const disconnectSecureVault = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/securevault", { method: "DELETE" });
      const { ok } = await readJson<{ connected: boolean }>(res);
      if (ok) setConnected(false);
      return ok;
    } catch {
      return false;
    }
  }, []);

  /** Send a scanned PDF to the vault. Returns the SecureVault document_id or null. */
  const saveToVault = useCallback(
    async (blob: Blob, fileName: string, title?: string): Promise<VaultSaveResult | null> => {
      setIsSaving(true);
      setSaveError(null);
      setLastResult(null);
      try {
        const form = new FormData();
        form.append("file", blob, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
        if (title) form.append("title", title);

        const res = await fetch("/api/securevault/ingest", { method: "POST", body: form });
        const { ok, data } = await readJson<VaultSaveResult>(res);
        if (!ok || !data.document_id) {
          setSaveError(data.error ?? "SecureVault did not return a document id.");
          return null;
        }
        const result: VaultSaveResult = { document_id: data.document_id, status: data.status };
        setLastResult(result);
        return result;
      } catch {
        setSaveError("Could not reach the server. Please try again.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  return {
    connected,
    isConnecting,
    connectError,
    connectSecureVault,
    disconnectSecureVault,
    saveToVault,
    isSaving,
    saveError,
    lastResult,
    checkConnection,
  };
}

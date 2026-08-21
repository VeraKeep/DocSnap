/**
 * GarageSnap client hook — modeled on DocSnap's `src/hooks/useCloudSync.ts`
 * and the GarageSnap prototype's `useAssetSync`.
 *
 * Behavior:
 * - Unauthenticated / auth-unconfigured: pure localStorage behavior (seed →
 *   load → save), SSR-safe (seeds render server-side; persisted data loads in
 *   a mount effect). Clearly demo data.
 * - Signed in + cloud configured (`cloudActive`): the asset list comes from
 *   the server (per-user JSON at `data/<userId>-assets.json`, identity from
 *   the verified Clerk session — never from the client). Every mutation goes
 *   to the server; localStorage is kept as an offline mirror.
 * - Any server failure (auth unavailable, env not configured, transient
 *   error) degrades back to the local store instead of crashing.
 * - `documents` holds the signed-in user's DocSnap CloudDocuments (via the
 *   existing `listDocuments` seam) so the add form can attach a real
 *   document reference; on any failure it degrades to an empty list and the
 *   UI shows the honest manual-label state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/tanstack-start";
import { uploadAssetImage } from "../cloudSync";
import {
  isAssetCloudConfigured,
  listAssets,
  addAsset,
  updateAsset,
  deleteAsset,
} from "../assetStorage";
import {
  loadAssets,
  saveAssets,
  SEED_ASSETS,
  type Asset,
} from "../assetStore";
import { listDocuments } from "../cloudStorage";
import type { CloudDocument } from "../cloudTypes";

export function useAssetSync() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();

  const [assets, setAssets] = useState<Asset[]>(SEED_ASSETS);
  const [hydrated, setHydrated] = useState(false);
  const [isCloudReady, setIsCloudReady] = useState(false);
  const [cloudActive, setCloudActive] = useState(false);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** The user's DocSnap documents, for the attach-a-document picker. */
  const [documents, setDocuments] = useState<CloudDocument[]>([]);

  // Check whether the server store is configured (Clerk + UploadThing env).
  useEffect(() => {
    isAssetCloudConfigured()
      .then(setIsCloudReady)
      .catch(() => setIsCloudReady(false));
  }, []);

  // Hydrate the local store on mount (SSR renders seeds; effect swaps in the
  // persisted list — the localStorage fallback, unchanged from the prototype).
  useEffect(() => {
    setAssets(loadAssets());
    setHydrated(true);
  }, []);

  // Persist every change to localStorage as the offline mirror. When the
  // cloud store is active this is a mirror, never the source of truth.
  useEffect(() => {
    if (hydrated) saveAssets(assets);
  }, [assets, hydrated]);

  const cloudEligible = !!isSignedIn && isCloudReady && !!user?.id;
  const prevEligible = useRef(false);

  // Transition the asset list to the server when the user becomes eligible,
  // and back to the local store when they sign out / cloud is unavailable.
  useEffect(() => {
    if (cloudEligible === prevEligible.current) return;
    prevEligible.current = cloudEligible;
    if (!cloudEligible) {
      setCloudActive(false);
      setDocuments([]);
      return;
    }
    setLoadingCloud(true);
    listAssets()
      .then((serverAssets) => {
        setAssets(serverAssets); // server list wins while signed in
        setCloudActive(true);
      })
      .catch(() => {
        // Auth/config unavailable or transient failure — stay on the local store.
        setCloudActive(false);
      })
      .finally(() => setLoadingCloud(false));

    // Load DocSnap documents for the attach picker. Failures degrade to the
    // manual-label state in the UI — never fatal.
    listDocuments({ data: user!.id })
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [cloudEligible, user?.id]);

  /** Persist a new asset. Returns true on success. */
  const saveAsset = useCallback(
    async (asset: Asset): Promise<boolean> => {
      if (cloudActive && user?.id) {
        try {
          const saved = await addAsset({ data: { asset } });
          setAssets((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
          return true;
        } catch (err) {
          console.error("Cloud save failed:", err);
          return false;
        }
      }
      setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
      return true;
    },
    [cloudActive, user?.id],
  );

  /** Persist an updated asset. Returns true on success. */
  const saveAssetUpdate = useCallback(
    async (asset: Asset): Promise<boolean> => {
      if (cloudActive && user?.id) {
        try {
          const saved = await updateAsset({ data: { id: asset.id, asset } });
          setAssets((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
          return true;
        } catch (err) {
          console.error("Cloud update failed:", err);
          return false;
        }
      }
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)));
      return true;
    },
    [cloudActive, user?.id],
  );

  /** Delete an asset by id. Returns true on success. */
  const removeAsset = useCallback(
    async (id: number): Promise<boolean> => {
      if (cloudActive && user?.id) {
        try {
          await deleteAsset({ data: { id } });
          setAssets((prev) => prev.filter((a) => a.id !== id));
          return true;
        } catch (err) {
          console.error("Cloud delete failed:", err);
          return false;
        }
      }
      setAssets((prev) => prev.filter((a) => a.id !== id));
      return true;
    },
    [cloudActive, user?.id],
  );

  /**
   * Upload a photo via the shared UploadThing app. Only meaningful when
   * `cloudActive` (uploads require a verified session + configured endpoint);
   * otherwise returns null so the caller keeps honest demo behavior.
   */
  const uploadPhoto = useCallback(
    async (file: File): Promise<{ fileKey: string; fileUrl: string } | null> => {
      if (!cloudActive) return null;
      setUploading(true);
      try {
        return await uploadAssetImage(file);
      } catch (err) {
        console.error("Photo upload failed:", err);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [cloudActive],
  );

  return {
    assets,
    hydrated,
    authLoaded,
    isSignedIn: isSignedIn ?? false,
    user,
    isCloudReady,
    cloudActive,
    loadingCloud,
    uploading,
    documents,
    saveAsset,
    saveAssetUpdate,
    removeAsset,
    uploadPhoto,
  };
}

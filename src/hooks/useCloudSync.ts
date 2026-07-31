import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/tanstack-start";
import { uploadPDFBlob } from "../cloudSync";
import {
  isCloudConfigured,
  listDocuments,
  addDocument,
  deleteDocument,
  updateDocumentCategory,
  type CloudDocument,
  type DocCategory,
} from "../cloudStorage";

export function useCloudSync() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCloudReady, setIsCloudReady] = useState(false);
  const [myScans, setMyScans] = useState<CloudDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Check cloud configuration
  useEffect(() => {
    isCloudConfigured().then(setIsCloudReady).catch(() => setIsCloudReady(false));
  }, []);

  // Load saved documents when signed in
  useEffect(() => {
    if (!isSignedIn || !isCloudReady || !user?.id) {
      setMyScans([]);
      return;
    }
    setLoadingDocs(true);
    listDocuments(user.id)
      .then(setMyScans)
      .catch(() => setMyScans([]))
      .finally(() => setLoadingDocs(false));
  }, [isSignedIn, isCloudReady, user?.id]);

  /** Save a PDF blob to cloud storage. Returns true on success. */
  const saveToCloud = useCallback(
    async (pdfBlob: Blob, pageCount: number, autoCategory?: string): Promise<boolean> => {
      if (!isSignedIn || !user?.id) return false;

      setIsSaving(true);
      setSaveSuccess(false);

      try {
        const fileName = `document-${Date.now()}.pdf`;

        const uploadResult = await uploadPDFBlob(pdfBlob, fileName);
        if (!uploadResult) {
          throw new Error("Upload failed");
        }

        await addDocument({
          userId: user.id,
          name: fileName,
          pageCount,
          fileKey: uploadResult.fileKey,
          fileUrl: uploadResult.fileUrl,
          autoCategory: autoCategory || "",
        });

        const updatedDocs = await listDocuments(user.id);
        setMyScans(updatedDocs);
        setSaveSuccess(true);
        return true;
      } catch (err) {
        console.error("Save to cloud failed:", err);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [isSignedIn, user?.id],
  );

  /** Reload scans from cloud. */
  const loadScans = useCallback(async () => {
    if (!user?.id) return;
    setLoadingDocs(true);
    try {
      const docs = await listDocuments(user.id);
      setMyScans(docs);
    } catch {
      setMyScans([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [user?.id]);

  /** Delete a scan by id. */
  const deleteScan = useCallback(
    async (docId: string) => {
      if (!user?.id) return;
      setDeletingDocId(docId);
      try {
        await deleteDocument({ userId: user.id, docId });
        setMyScans((prev) => prev.filter((d) => d.id !== docId));
      } catch (err) {
        console.error("Delete failed:", err);
      } finally {
        setDeletingDocId(null);
      }
    },
    [user?.id],
  );

  /** Update a document's user-set category */
  const updateDocCategory = useCallback(
    async (docId: string, category: DocCategory) => {
      if (!user?.id) return;
      // Optimistic update
      setMyScans((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, userCategory: category } : d,
        ),
      );
      try {
        await updateDocumentCategory({
          userId: user.id,
          docId,
          userCategory: category,
        });
      } catch (err) {
        console.error("Category update failed:", err);
        // Reload on failure to revert optimistic update
        await loadScans();
      }
    },
    [user?.id, loadScans],
  );

  return {
    saveToCloud,
    isSaving,
    saveSuccess,
    setSaveSuccess,
    isCloudReady,
    myScans,
    loadScans,
    deleteScan,
    updateDocCategory,
    loadingDocs,
    deletingDocId,
    authLoaded,
    isSignedIn,
    user,
  };
}

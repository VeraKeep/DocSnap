import { useCallback, useState } from "react";
import { processDocument } from "../documentProcessor";
import type { Quad } from "../documentProcessor";

export function useDocumentProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [error, setError] = useState("");

  const processImage = useCallback(
    (imageData: ImageData, mimeType: string = "image/jpeg", quality: number = 0.92) => {
      setIsProcessing(true);
      setError("");
      try {
        const result = processDocument(imageData, mimeType, quality);
        setProcessedImage(result?.dataUrl ?? null);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Processing failed";
        setError(msg);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { processImage, isProcessing, processedImage, error };
}

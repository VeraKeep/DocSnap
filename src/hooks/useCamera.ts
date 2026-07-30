import { useCallback, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "active" | "error";

export interface CaptureResult {
  imageData: ImageData;
  dataUrl: string;
  width: number;
  height: number;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraState("idle");
  }, []);

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (!video || !streamRef.current) return;

    video.srcObject = streamRef.current;
    video.muted = true;
    video.playsInline = true;

    void video.play().catch((error) => {
      console.error("Camera preview failed to start:", error);
    });
  }, []);

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    stopCamera();
    setError("");

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Your browser doesn't support camera access. Please use a modern browser like Chrome, Safari, or Firefox.",
      );
      setCameraState("error");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraState("active");
      return stream;
    } catch (err: unknown) {
      const e = err as DOMException;
      const msg =
        e.name === "NotAllowedError"
          ? "Camera access was denied. Please allow camera access in your browser settings and try again."
          : e.name === "NotFoundError"
            ? "No camera found. Please connect a camera and try again."
            : `Could not access camera: ${e.message}`;
      setError(msg);
      setCameraState("error");
      return null;
    }
  }, [stopCamera]);

  const captureFrame = useCallback((): CaptureResult | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    return { imageData, dataUrl, width: canvas.width, height: canvas.height };
  }, []);

  return {
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    captureFrame,
    attachVideo,
    cameraState,
    error,
  };
}

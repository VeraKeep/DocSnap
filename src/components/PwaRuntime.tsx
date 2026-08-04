import { useEffect, useState } from "react";

/** Registers the offline app shell and keeps a quiet online/offline status visible. */
export function PwaRuntime() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const setOnline = () => setOffline(false);
    const setOfflineState = () => setOffline(true);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOfflineState);

    let registration: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((value) => {
          registration = value;
          console.info("[DocSnap] offline app shell ready");
          if (value.waiting) {
            console.info("[DocSnap] an update is ready; it will apply on next visit");
          }
          value.addEventListener("updatefound", () => {
            const worker = value.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("[DocSnap] a new version is ready; reload to update");
              }
            });
          });
        })
        .catch((error) => console.warn("[DocSnap] offline support unavailable", error));
    }

    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOfflineState);
      // Keep the registration active; only remove this component's listeners.
      void registration;
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-400/20 bg-slate-900/95 px-4 py-2 text-center text-xs font-medium text-amber-200 shadow-lg backdrop-blur-sm safe-pb"
    >
      You&apos;re offline — scanning still works!
    </div>
  );
}

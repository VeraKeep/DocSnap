import { useUser } from "@clerk/tanstack-start";
import { useEffect } from "react";

interface OpinlyPixelApi {
  identify: (identity: { email: string; userId?: string }) => void;
}

/** Identify an authenticated DocSnap visitor after Opinly's async pixel is ready. */
export function OpinlyIdentity() {
  const { isLoaded, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const userId = user?.id;

  useEffect(() => {
    if (!isLoaded || !email) return;

    const identify = () => {
      const pixel = (window as typeof window & { opinly?: OpinlyPixelApi }).opinly;
      pixel?.identify({ email, userId });
    };

    if ((window as typeof window & { opinly?: OpinlyPixelApi }).opinly) {
      identify();
      return;
    }

    window.addEventListener("opinly:ready", identify, { once: true });
    return () => window.removeEventListener("opinly:ready", identify);
  }, [email, isLoaded, userId]);

  return null;
}

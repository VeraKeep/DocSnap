import { useState } from "react";
import { joinWaitlist } from "../features/waitlist/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * Early-access / waitlist capture that writes into the `waitlist` table via
 * the shared server action. Deliberately low-pressure and honest: no urgency,
 * no "limited spots", no countdown. Validation happens client-side AND
 * server-side; the button is disabled while in flight and after success so a
 * single address can't be hammered from the same form.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setState({ kind: "error", message: "Enter your email address." });
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", message: "That email doesn't look right — please double-check it." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const result = await joinWaitlist({ data: { email: value } });
      if (result.status === "added" || result.status === "already") {
        setState({ kind: "done", message: result.message });
        setEmail("");
      } else {
        // rate_limited / unconfigured — show the server's message.
        setState({ kind: "error", message: result.message });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong — please try again.";
      setState({ kind: "error", message: msg });
    }
  }

  const busy = state.kind === "submitting" || state.kind === "done";

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center"
      >
        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          placeholder="you@example.com"
          aria-label="Email address"
          disabled={busy}
          className="w-full rounded-full border border-gray-600 bg-gray-900/70 px-5 py-3 text-base text-gray-100 placeholder-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-indigo-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "submitting" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Joining…
            </>
          ) : state.kind === "done" ? (
            "You're on the list ✓"
          ) : (
            "Join the early access list"
          )}
        </button>
      </form>
      {state.kind === "done" && (
        <p className="mt-3 text-center text-sm font-medium text-green-400" role="status">
          {state.message}
        </p>
      )}
      {state.kind === "error" && (
        <p className="mt-3 text-center text-sm font-medium text-red-400" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

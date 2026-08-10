import { createFileRoute } from "@tanstack/react-router";
// Register the protected server function in the app graph so the auth-contract
// proof (`whoAmI`) is resolvable via /_serverFn/*. The full capture/library UI
// in a later step calls this server fn from the client.
import { whoAmI } from "~/features/receiptsnap/server";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — DocSnap" },
      {
        name: "description",
        content:
          "Your receipts, searchable forever — capture, extract, and find any purchase in seconds. Sign in required.",
      },
    ],
  }),
  component: Receipts,
});

/**
 * Stub for the ReceiptSnap module. The capture/search/detail UI lands here in
 * a later step; until then the route renders the sign-in-required state.
 */
function Receipts() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Receipts
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-gray-400">
        Receipts — sign in required.
      </p>
    </main>
  );
}

// Reference the proof function so the import is retained in the build graph
// while the route stays a static stub.
void whoAmI;

import { createFileRoute, Link } from "@tanstack/react-router";
import { ReceiptLibrary } from "~/features/receiptsnap/components/ReceiptLibrary";

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
  component: ReceiptsPage,
});

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17"
          stroke="#fff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M46 20l-6 12 6 12"
          stroke="#a5b4fc"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * ReceiptSnap module entry: /receipts renders the receipts library (auth
 * gate, list, search, detail modal, capture flow) in DocSnap's dark
 * gray/indigo treatment. The module is self-contained on this route — the
 * root shell supplies the Clerk provider, scripts, and footer.
 */
function ReceiptsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <Logo />
          DocSnap
        </Link>
        <Link to="/scan" className="text-sm text-gray-400 transition hover:text-gray-200">
          ← Back to app
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-indigo-400">ReceiptSnap</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Your receipt library
        </h1>
        <p className="mt-3 max-w-xl text-gray-400">
          Snap a receipt and find it forever — merchant, date, items, serial
          numbers, and warranty info, all searchable in one place.
        </p>
        <ReceiptLibrary />
      </section>
    </main>
  );
}

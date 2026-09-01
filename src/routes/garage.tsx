import { createFileRoute, Link } from "@tanstack/react-router";
import { GarageSnapApp } from "~/features/garagesnap/components/GarageSnapApp";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";

export const Route = createFileRoute("/garage")({
  head: () => ({
    meta: [
      { title: "GarageSnap — Workshop Inventory | DocSnap" },
      {
        name: "description",
        content:
          "GarageSnap, a DocSnap module — inventory your tools and equipment with photos, make/model and serial numbers, warranties, and storage locations. Sign in required.",
      },
    ],
  }),
  component: GaragePage,
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
 * GarageSnap module entry: /garage renders the workshop-inventory UI in
 * DocSnap's dark gray/indigo treatment (auth gate, add-on entitlement gate,
 * item cards, add/edit). The module is self-contained on this route — the
 * root shell supplies the Clerk provider, scripts, and footer. The add-on gate
 * lives inside GarageSnapApp (fails closed for users without addon_garagesnap),
 * mirroring /homesnap.
 */
function GaragePage() {
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

      <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "garagesnap" }} />
        <p className="text-sm font-medium text-indigo-400">GarageSnap</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Everything in its place
        </h1>
        <p className="mt-3 max-w-2xl text-gray-400">
          Inventory your tools and equipment with photos, make/model and serial
          numbers, warranties, and storage locations — so you always know what
          you own and where it lives.
        </p>
        <GarageSnapApp />
      </section>
    </main>
  );
}

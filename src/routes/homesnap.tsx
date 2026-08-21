import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeSnapApp } from "~/features/homesnap/components/HomeSnapApp";

export const Route = createFileRoute("/homesnap")({
  head: () => ({
    meta: [
      { title: "HomeSnap — DocSnap" },
      {
        name: "description",
        content:
          "A permanent digital record of your home — systems, appliances, warranties, receipts, and repair history. Sign in required.",
      },
    ],
  }),
  component: HomeSnapPage,
});

function HomeLogo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg">
      🏡
    </div>
  );
}

/**
 * HomeSnap module entry: /homesnap renders the home-record UI (auth gate,
 * properties, objects, timeline, documents) in DocSnap's dark gray/indigo
 * treatment. The module is self-contained on this route — the root shell
 * supplies the Clerk provider, scripts, and footer.
 */
function HomeSnapPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <HomeLogo />
          DocSnap
        </Link>
        <Link to="/scan" className="text-sm text-gray-400 transition hover:text-gray-200">
          ← Back to app
        </Link>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-indigo-400">HomeSnap</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Your home, permanently on record
        </h1>
        <p className="mt-3 max-w-2xl text-gray-400">
          Track every system, appliance, fixture, and improvement in your home —
          with its manufacturer, model, serial number, warranty, receipts, and
          full repair history, all in one place.
        </p>
        <HomeSnapApp />
      </section>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeSnapDemo } from "~/features/homesnap/components/HomeSnapDemo";

/**
 * /homesnap-demo — the public "See what HomeSnap does in 30 seconds" tour
 * (file 04). Reachable from the HomeSnap module card helper link and from the
 * HomeSnap paywall. Fully read-only: static sample data only, no persistence.
 */
export const Route = createFileRoute("/homesnap-demo")({
  head: () => ({
    meta: [
      { title: "HomeSnap demo — DocSnap" },
      {
        name: "description",
        content:
          "See what HomeSnap does in 30 seconds — a quick look at how one record keeps every warranty, receipt, and repair for your home in one place.",
      },
    ],
  }),
  component: HomeSnapDemoPage,
});

function HomeLogo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg">
      🏡
    </div>
  );
}

function HomeSnapDemoPage() {
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

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-center text-sm font-medium text-indigo-400">HomeSnap</p>
        <h1 className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          See what HomeSnap does in 30 seconds.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-400">
          We'll show you the record of a real-looking home, then you can decide if it's yours.
        </p>
        <div className="mt-8">
          <HomeSnapDemo />
        </div>
      </section>
    </main>
  );
}

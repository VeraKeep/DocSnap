import { createFileRoute, Link } from "@tanstack/react-router";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/**
 * /homesnap-sales — the self-contained HomeSnap sales/landing page
 * (file 02-landing-sales-page.md). Single primary CTA ("Get HomeSnap")
 * repeated in the hero, the price block, and the footer; VARIANT A headline.
 * Primary CTAs link to the existing live Stripe checkout URLs.
 */
export const Route = createFileRoute("/homesnap-sales")({
  head: () => ({
    meta: [
      { title: "HomeSnap — DocSnap" },
      {
        name: "description",
        content:
          "Everything you need to know about your home, in one place. Appliances, systems, warranties, repairs, manuals, and receipts — organized around the objects in your home.",
      },
    ],
  }),
  component: HomeSnapSalesPage,
});

/* Shared copy/links so hero, price block, and footer stay in sync. */
const CTA_PRIMARY = "Start your home record";
const CTA_PRIMARY_PRICE = "$3.99/month";
const CTA_SECONDARY = "or $39.99/year — two months free";
const CODE = {
  primary: {
    href: MODULE_CHECKOUT_URLS.HOMESNAP_MONTHLY,
    label: "Get HomeSnap — $3.99/month",
  },
  yearly: MODULE_CHECKOUT_URLS.HOMESNAP_ANNUAL,
};

function HomeLogo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg">
      🏡
    </div>
  );
}

const BENEFITS: { title: string; body: string }[] = [
  {
    title: "Stop losing what you already know",
    body: "The model number you need when the repair tech calls. The serial for a warranty claim. What you paid, and when the warranty runs out. HomeSnap captures all of it the day it happens and keeps it attached to the right object — so it's there the day you actually need it, not buried in a drawer or an old email.",
  },
  {
    title: "Know what's due before it's a problem",
    body: "Every filter, flush, battery, and annual check has a schedule. HomeSnap tells you what's due and what's coming up, and marks the next date when you log it done. No more guessing when the furnace filter was last changed.",
  },
  {
    title: "See your whole home as the asset it is",
    body: "A searchable record of your big-ticket items — TVs, computers, furniture, tools, electronics, jewelry — with value, photos, serials, and receipts, and a running total of what you've recorded. And when it's time to sell or file a claim, HomeSnap prints a clean, dated report of your improvements and repairs.",
  },
  {
    title: "Kept current by everyone who calls it home",
    body: "Share your property with your household at view or edit access. Add a receipt or mark a fix done from your own phone, and it's logged — along with a transparent history of who changed what, and when.",
  },
];

const FEATURES: string[] = [
  "Record your property and everything in it — systems, appliances, fixtures, and improvements, each with manufacturer, model, serial, location, dates, price, warranty, and status, plus photos and documents on a per-object timeline.",
  "Turn a receipt into a record — when a DocSnap receipt looks like a home purchase, add it to HomeSnap and the object is pre-filled and the receipt attached for you.",
  "Never miss a maintenance date — recurring schedules (filter, flush, battery, annual, inspection, clean) with next-due and a due/coming-up view.",
  "Know your inventory's value — search big-ticket items with photos, serials, and receipts, and see your total recorded value.",
  "Track it between Home and Garage — the same physical item lives in both, linked.",
  "Share it with the household — view or edit access, with an activity log of every change.",
  "Make it sell-ready — spend-over-time (purchases vs repairs) and a printable home-sale/insurance report.",
];

function HomeSnapSalesPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <HomeLogo />
          DocSnap
        </Link>
        <Link to="/homesnap-demo" className="text-sm text-gray-400 transition hover:text-gray-200">
          See a 30-second demo →
        </Link>
      </header>

      {/* Hero */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-indigo-400">HomeSnap</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Everything you need to know about your home, in one place.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            Appliances, systems, warranties, repairs, manuals, and receipts — recorded the day
            you get them, organized around the objects in your home, and retrievable the moment
            you need them. Years from now, you'll still know what you own, what it cost, and
            what's covered.
          </p>
          <div className="mt-8">
            <a
              href={CODE.primary.href}
              className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
            >
              {CTA_PRIMARY} — {CTA_PRIMARY_PRICE}
            </a>
            <p className="mt-3 text-sm text-gray-400">{CTA_SECONDARY}</p>
          </div>
          <p className="mt-5 text-xs text-gray-600">
            Inside your DocSnap account. Cancel anytime. No credit card required to browse the demo.
          </p>
        </div>
      </section>

      {/* Benefit sections */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Why keep a home record at all?
          </h2>
          <div className="mt-10 space-y-8">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
                <h3 className="text-xl font-semibold">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-gray-300">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can do — feature rundown */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What you can do
          </h2>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm leading-relaxed text-gray-300">
                <span className="mt-0.5 text-indigo-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Price block */}
      <section className="border-b border-gray-800/50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Simple, honest pricing
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
              <p className="text-sm font-medium text-gray-400">Monthly</p>
              <p className="mt-3 text-4xl font-bold">$3.99<span className="text-base font-normal text-gray-400">/month</span></p>
              <p className="mt-3 text-sm text-gray-400">Good for trying it out</p>
              <p className="mt-1 text-sm text-gray-300">Full HomeSnap access</p>
              <a
                href={CODE.primary.href}
                className="mt-6 inline-flex justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Get HomeSnap — $3.99/month
              </a>
            </div>
            <div className="flex flex-col rounded-2xl border border-indigo-700/60 bg-indigo-950/30 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-indigo-300">Yearly · Best value</p>
                <span className="rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs font-medium text-indigo-200">
                  two months free
                </span>
              </div>
              <p className="mt-3 text-4xl font-bold">$39.99<span className="text-base font-normal text-gray-400">/year</span></p>
              <p className="mt-2 text-xs text-gray-500">≈ $3.33/mo</p>
              <p className="mt-2 text-sm text-gray-400">Keeping your home record for the long haul</p>
              <p className="mt-1 text-sm text-gray-300">Full HomeSnap access, two months free</p>
              <a
                href={CODE.yearly}
                className="mt-6 inline-flex justify-center rounded-full border border-indigo-500 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-600/20"
              >
                Get HomeSnap — $39.99/year
              </a>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-sm text-gray-400">
            One home record, all your properties, shared with your household — one price, either
            way. <span className="text-gray-500">Cancel anytime.</span>
          </p>
        </div>
      </section>

      {/* Final CTA + microcopy */}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <a
            href={CODE.primary.href}
            className="inline-flex justify-center rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500"
          >
            Get HomeSnap — $3.99/month
          </a>
          <p className="mt-3 text-sm text-gray-400">Yearly option — $39.99/year</p>
          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-left">
            <p className="text-sm leading-relaxed text-gray-300">
              <span className="font-semibold text-gray-100">Not sure where to start?</span> Add
              your first object — say, your water heater or HVAC. If you have the receipt,
              HomeSnap can fill in most of it for you. Everything else you can add over time;
              the record grows with your home.
            </p>
          </div>
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-gray-500">
            <Link to="/homesnap-demo" className="transition hover:text-gray-300">
              See a 30-second demo →
            </Link>
            <span>·</span>
            <Link to="/" className="transition hover:text-gray-300">Back to DocSnap</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">
        <Link to="/privacy" className="transition hover:text-gray-400">Privacy</Link>
        <Link to="/terms" className="transition hover:text-gray-400">Terms</Link>
        <Link to="/contact" className="transition hover:text-gray-400">Contact</Link>
      </footer>
    </main>
  );
}

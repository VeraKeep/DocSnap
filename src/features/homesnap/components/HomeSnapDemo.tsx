/**
 * HomeSnapDemo — the "See what HomeSnap does in 30 seconds" tour (file
 * 04-onboarding-first-run-demo.md).
 *
 * A short, self-guided, 3-step sample-data tour shown BEFORE/AT the HomeSnap
 * paywall for a first-time, non-entitled visitor. Its entire purpose is to
 * make the product's payoff tangible without any setup or typing.
 *
 * NON-PERSISTENCE GUARANTEE (please keep this true):
 * - This component renders ONLY hardcoded, in-file SAMPLE data (the "Sample
 *   home — from the tour" water heater). It never calls a server action, never
 *   reaches the database, and never writes to any storage. There is no fetch,
 *   no createServerFn, no mutation, and no forms. Every value below is a local
 *   const. The tour is read-only and self-cleaning by construction: nothing it
 *   does can persist, because no write path exists.
 * - Step 3's CTA is the only interactive action, and it links out to the live
 *   Stripe checkout (an external URL) — inward it never writes.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MODULE_CHECKOUT_URLS } from "~/moduleCheckout";

/* ---------------------------------------------------------------- */
/* STATIC SAMPLE DATA — clearly marked sample, never persisted.      */
/* ---------------------------------------------------------------- */
const SAMPLE_PROPERTY = "Sample home — from the tour";
const SAMPLE_OBJECT = {
  name: "Main Water Heater — Rheem Performance 40",
  price: "$649",
  installed: "Mar 2024",
  warranty: "until Mar 2031",
  lastService: "6 months ago",
};

const SAMPLE_TIMELINE = [
  { date: "Jul 2026", label: "Serviced — flushed tank", by: "PlumbRight Co." },
  { date: "Mar 2024", label: "Installed · Rheem Performance 40", by: "Home Depot" },
];

const SAMPLE_DOCS = ["Receipt · Home Depot · Mar 2024", "Owner manual · Rheem Performance 40"];

/* Step 2 payoff bullets (grounded in real shipped features). */
const PAYOFF_BULLETS: string[] = [
  "Know what's covered. Warranty dates per object — claim what you're owed, not pay twice.",
  "Never miss a check. A maintenance schedule for filters, flush, batteries, and annual items, with a \"due / coming up\" view.",
  "See your whole asset. A searchable inventory with photos, serials, receipts, and a total value.",
  "Be ready for the big moments. A clean, dated report of improvements and repairs for a sale or insurance claim.",
  "Share it with the household. View or edit access, with a log of who changed what.",
  "(little extra): Bought it in DocSnap? The receipt can become the object.",
];

type DemoStep = 0 | 1 | 2 | 3;

export function HomeSnapDemo({ onExit }: { onExit?: () => void }) {
  const [step, setStep] = useState<DemoStep>(0);
  const [showSetupTip, setShowSetupTip] = useState(false);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        {(["0", "1", "2", "3"] as const).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition ${
              i <= step ? "bg-indigo-500" : "bg-gray-700"
            }`}
          />
        ))}
        <span className="ml-2">30-second tour</span>
      </div>

      {step === 0 && (
        <Card>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20 text-3xl">
            🏡
          </div>
          <h2 className="mt-5 text-xl font-semibold">See what HomeSnap does in 30 seconds.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
            We'll show you the record of a real-looking home, then you can decide if it's yours.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button onClick={() => setStep(1)}>Show me →</Button>
            {onExit && (
              <button type="button" onClick={onExit} className="text-sm text-gray-500 transition hover:text-gray-300">
                Skip the demo
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Step 1 — the object record (the core abstraction) */}
      {step === 1 && (
        <Card>
          <p className="text-sm font-medium text-indigo-400">Step 1 · The object record</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
            One object. Everything about it, attached.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-300">
            Take the water heater. Here's its manufacturer, model, and serial — its price, when
            it was installed, and its warranty date. Track its repair timeline and drop in the
            manual and receipt. When the repair tech calls, this is what you reach for.
          </p>

          {/* Sample object record card */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/80">
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-900/40 text-xl">
                  🔥
                </div>
                <div>
                  <p className="text-sm font-semibold">{SAMPLE_OBJECT.name}</p>
                  <p className="text-xs text-gray-500">
                    {SAMPLE_PROPERTY} · Appliance · Active
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-amber-700/50 bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-300">
                Warranty · until Mar 2031
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 text-sm sm:grid-cols-3">
              {[
                ["Price paid", SAMPLE_OBJECT.price],
                ["Installed", SAMPLE_OBJECT.installed],
                ["Warranty", SAMPLE_OBJECT.warranty],
                ["Last serviced", SAMPLE_OBJECT.lastService],
                ["Manufacturer", "Rheem"],
                ["Model · Serial", "Performance 40 · R40N"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-gray-500">{k}</dt>
                  <dd className="mt-0.5 font-medium text-gray-200">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="border-t border-gray-800 px-5 py-4">
              <p className="text-xs font-medium text-gray-500">Timeline &amp; attached documents</p>
              <ul className="mt-2 space-y-1.5">
                {SAMPLE_TIMELINE.map((t) => (
                  <li key={t.date} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{t.label}</span>
                    <span className="text-xs text-gray-600">{t.date}</span>
                  </li>
                ))}
                {SAMPLE_DOCS.map((d) => (
                  <li key={d} className="flex items-center gap-2 text-sm text-gray-400">
                    <span>📎</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500">This is sample data — nothing here is saved to your account.</span>
            <Button onClick={() => setStep(2)}>See what that does →</Button>
          </div>
        </Card>
      )}

      {/* Step 2 — the payoff, grounded in real features */}
      {step === 2 && (
        <Card>
          <p className="text-sm font-medium text-indigo-400">Step 2 · The payoff</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
            Here's what that record does for you.
          </h2>
          <ul className="mt-5 space-y-3 text-left">
            {PAYOFF_BULLETS.map((b) => {
              const match = b.match(/^\*\*(.+?)\*\*\s*(.*)$/);
              return (
                <li key={b} className="flex items-start gap-3 text-sm leading-relaxed text-gray-300">
                  <span className="mt-0.5 text-indigo-400">✓</span>
                  <span>
                    {match ? (
                      <>
                        <span className="font-semibold text-gray-100">{match[1]}</span> {match[2]}
                      </>
                    ) : (
                      b
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setStep(3)}>So this is worth it →</Button>
          </div>
        </Card>
      )}

      {/* Step 3 — the decision */}
      {step === 3 && (
        <Card>
          <p className="text-sm font-medium text-indigo-400">Step 3 · The decision</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">Your home, better recorded.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-400">
            You'd start with your property, then add your first object — even just the water
            heater. The record grows as your home does, and it's yours for good.
          </p>

          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <a
                href={MODULE_CHECKOUT_URLS.HOMESNAP_MONTHLY}
                className="inline-flex justify-center rounded-full bg-indigo-600 px-7 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Get HomeSnap — $3.99/mo
              </a>
              <a
                href={MODULE_CHECKOUT_URLS.HOMESNAP_ANNUAL}
                className="text-sm text-gray-400 transition hover:text-gray-200"
              >
                or $39.99/yr · two months free
              </a>
              <p className="text-xs text-gray-600">Inside your DocSnap account · Cancel anytime.</p>
            </div>
            {onExit && (
              <button type="button" onClick={onExit} className="text-sm text-gray-500 transition hover:text-gray-300">
                Not now — take me back
              </button>
            )}
          </div>

          {/* Setup-fear microcopy (hover/tooltip) */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
            <span>Is this a lot of setup?</span>
            <span
              className="relative inline-flex cursor-help items-center"
              onMouseEnter={() => setShowSetupTip(true)}
              onMouseLeave={() => setShowSetupTip(false)}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full border border-gray-700 text-[10px] text-gray-400">
                i
              </span>
              {showSetupTip && (
                <span className="absolute bottom-6 left-1/2 z-10 w-64 -translate-x-1/2 rounded-lg border border-gray-700 bg-gray-900 p-3 text-left text-xs leading-relaxed text-gray-300 shadow-xl">
                  No. Start with one object — even just your property. Add details when you
                  have them; the record grows as your home does. You can add to it a little at a
                  time, from anywhere.
                </span>
              )}
            </span>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
        <Link to="/" className="transition hover:text-gray-400">← Back to DocSnap</Link>
        <span>·</span>
        <Link to="/homesnap" className="transition hover:text-gray-400">Back to HomeSnap</Link>
        <span>·</span>
        <Link to="/homesnap-sales" className="transition hover:text-gray-400">Learn more</Link>
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 text-center sm:p-8">
      {children}
    </div>
  );
}

function Button({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex justify-center rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
    >
      {children}
    </button>
  );
}

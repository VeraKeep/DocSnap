/**
 * Quick standalone verification of the ContractSnap natural-language search
 * deterministic layer against a representative dataset. Not part of the app's
 * runtime — a dev-time check only. Run with: bun scripts/search-test.ts
 */
import {
  allTermsMatch,
  buildSearchCorpus,
  expandTerms,
  scoreCorpus,
  searchTerms,
} from "../src/features/contractsnap/server";
import type { ContractExtraction } from "../src/features/contractsnap/types";

// Compact stand-in for a ContractRow, just the fields buildSearchCorpus reads.
type Row = Record<string, unknown>;

function makeExtraction(overrides: Partial<ContractExtraction>): ContractExtraction {
  return {
    title: "x",
    contract_type: null,
    parties: [],
    effective_date: null,
    expiration_date: null,
    renewal_date: null,
    cancellation_deadline: null,
    cancellation_window_days: null,
    notice_period_days: null,
    auto_renewal: null,
    renewal_type: null,
    payment: null,
    fees: null,
    deposits: null,
    penalties: null,
    jurisdiction: null,
    major_obligations: [],
    summary: {
      what_this_contract_does: "",
      what_you_pay: "",
      what_you_must_do: "",
      what_they_must_do: "",
      important_dates: [],
      watch_out_for: [],
    },
    clauses: [],
    events: [],
    reminders: [],
    ...overrides,
  };
}

// Representative library.
const library: { row: Row; extraction: ContractExtraction }[] = [
  {
    // auto-renews, monthly payment
    row: { title: "Streaming Subscription — Netflix", contract_type: "Subscription", auto_renewal: true, renewal_type: "auto" },
    extraction: makeExtraction({
      payment: { amount: 15.99, currency: "USD", frequency: "monthly", source_status: "confirmed", confidence: 1 },
      summary: {
        what_this_contract_does: "Monthly streaming service membership.",
        what_you_pay: "You pay $15.99 per month.",
        what_you_must_do: "None.",
        what_they_must_do: "Provide streaming access.",
        important_dates: [],
        watch_out_for: [],
      },
      events: [{ id: 0, event_type: "expiration", date: "2026-12-31", source: "confirmed" }],
    }),
  },
  {
    // does not auto renew, one-time / annual
    row: { title: "Gym Membership — FitLife", contract_type: "Membership", auto_renewal: false, renewal_type: "manual" },
    extraction: makeExtraction({
      payment: { amount: 299, currency: "USD", frequency: "year" as never, source_status: "confirmed", confidence: 1 },
      summary: {
        what_this_contract_does: "Annual gym membership.",
        what_you_pay: "You pay $299 once per year.",
        what_you_must_do: "Renew manually each year.",
        what_they_must_do: "Provide facility access.",
        important_dates: [],
        watch_out_for: [],
      },
    }),
  },
  {
    // ends in 2026, no renewal
    row: { title: "Apartment Lease — Maple Apartments", contract_type: "Lease", auto_renewal: false, renewal_type: "none", expiration_date: "2026-06-30" },
    extraction: makeExtraction({
      payment: { amount: 1800, currency: "USD", frequency: "monthly", source_status: "confirmed", confidence: 1 },
      events: [{ id: 0, event_type: "expiration", date: "2026-06-30", source: "confirmed" }],
      summary: {
        what_this_contract_does: "Residential lease agreement.",
        what_you_pay: "You pay $1800 rent monthly.",
        what_you_must_do: "Pay rent, keep unit clean.",
        what_they_must_do: "Maintain the property.",
        important_dates: ["Expires June 30, 2026"],
        watch_out_for: [],
      },
    }),
  },
];

function scoreAll(query: string): { title: string; score: number }[] {
  const terms = expandTerms(searchTerms(query));
  const autoIntent = searchTerms(query).includes("auto") || searchTerms(query).includes("automatic");
  const out: { title: string; score: number }[] = [];
  for (const { row, extraction } of library) {
    if (autoIntent && row.auto_renewal !== true) continue;
    const corpus = buildSearchCorpus(row, extraction);
    if (!allTermsMatch(corpus, terms)) continue;
    const s = scoreCorpus(corpus, terms);
    out.push({ title: row.title as string, score: s });
  }
  return [...out].sort((a, b) => b.score - a.score);
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const auto = scoreAll("which contracts auto-renew?");
check('auto-renew query finds Netflix only, not non-auto contracts', auto.length === 1 && auto[0].title.includes("Netflix"));

const pay = scoreAll("what am I paying monthly?");
check("monthly payment query finds monthly contracts (Netflix + Lease), excludes annual FitLife", pay.some((r) => r.title.includes("Netflix")) && pay.some((r) => r.title.includes("Lease")) && !pay.some((r) => r.title.includes("FitLife")));

const end2026 = scoreAll("which contracts end in 2026?");
check("2026/end query finds lease (expires 2026-06-30) and Netflix (expires 2026-12-31)", end2026.some((r) => r.title.includes("Lease")) && end2026.some((r) => r.title.includes("Netflix")));

// tokenizer sanity
check("stopwords stripped: 'which contracts auto-renew?' -> terms [auto, renew]", JSON.stringify(searchTerms("which contracts auto-renew?")) === JSON.stringify(["auto", "renew"]));
check("hyphen split + year kept: 'what am I paying monthly?' -> terms [paying, monthly]", JSON.stringify(searchTerms("what am I paying monthly?")) === JSON.stringify(["paying", "monthly"]));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

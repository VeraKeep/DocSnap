import { createFileRoute, Link } from "@tanstack/react-router";
import { useSubscription } from "../hooks/useSubscription";

const PLANS = [
  { name: "DocSnap Free", price: "$0", cadence: "/forever", description: "Simple, private scanning for everyone.", features: ["Basic document scanning & storage", "Limited ReceiptSnap", "Download as PDF", "Local processing in your browser"], button: "Current Plan" },
  { name: "DocSnap Personal", price: "$7.99", cadence: "/month", description: "DocSnap + full ReceiptSnap.", url: "https://buy.stripe.com/eVqcN5g1f3tN5c82bzfw41o", features: ["Everything in Free", "Full ReceiptSnap", "Unlimited cloud storage", "Password-protected PDFs", "AI naming, reminders & redaction", "Sharing and duplicate detection"] },
  { name: "DocSnap Household", price: "$12.99", cadence: "/month", description: "DocSnap + ReceiptSnap + GarageSnap for your home.", badge: "Most Popular", url: "https://buy.stripe.com/cNi00j6qF8O7484bM9fw41n", features: ["Everything in Personal", "GarageSnap", "Household sharing", "Shared organization for the whole home"] },
  { name: "DocSnap Complete", price: "$19.99", cadence: "/month", description: "Every consumer and home module, including those added in the future.", badge: "Best Value", url: "https://buy.stripe.com/cNieVdbKZ2pJaws6rPfw41p", features: ["Everything in Household", "All consumer/home modules", "All future modules as they are added", "Priority support"] },
] as const;

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing — DocSnap © 2026" }, { name: "description", content: "Choose DocSnap Free, Personal, Household, or Complete. Private browser scanning is free; paid plans add cloud storage and home modules." }], links: [{ rel: "canonical", href: "https://docsnapapp.com/pricing" }] }),
  component: PricingPage,
});

function CheckIcon() { return <span className="shrink-0 text-green-400" aria-hidden="true">✓</span>; }

function PricingPage() {
  const { isPro, portalUrl } = useSubscription();
  return <main className="flex min-h-screen flex-col bg-gray-950 text-white">
    <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6"><Link to="/" className="text-lg font-semibold hover:text-indigo-400">DocSnap © 2026</Link><Link to="/" className="text-sm text-gray-400 hover:text-gray-200">← Back to app</Link></header>
    <section className="px-4 py-14 text-center sm:px-6"><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Plans for every kind of home</h1><p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-400">Start scanning privately for free, then choose the plan that fits your documents, receipts, and household.</p></section>
    <section className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-4 sm:px-6">
      {PLANS.map((plan, index) => <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${index === 1 ? "border-indigo-500/60 bg-indigo-950/30" : "border-gray-800 bg-gray-900/60"}`}>
        {plan.badge && <span className="absolute -top-3 left-5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold">{plan.badge}</span>}
        <h2 className="text-xl font-bold">{plan.name}</h2><p className="mt-2 min-h-12 text-sm text-gray-400">{plan.description}</p>
        <div className="mt-5 flex items-baseline gap-1"><span className="text-4xl font-bold">{plan.price}</span><span className="text-sm text-gray-400">{plan.cadence}</span></div>
        {index === 0 ? <span className="mt-5 inline-flex justify-center rounded-full border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-400">{plan.button}</span> : <a href={plan.url} className="mt-5 inline-flex justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500">Subscribe</a>}
        {index === 1 && isPro && (portalUrl ? <a href={portalUrl} className="mt-2 text-center text-xs text-indigo-300 hover:underline">Already subscribed? Manage subscription</a> : <span className="mt-2 text-center text-xs text-gray-500">Already subscribed?</span>)}
        <ul className="mt-7 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-3 text-sm text-gray-300"><CheckIcon />{feature}</li>)}</ul>
      </div>)}
    </section>
    <section className="border-t border-gray-800/50 px-4 py-16 sm:px-6"><div className="mx-auto max-w-2xl"><h2 className="text-center text-2xl font-bold">Frequently Asked Questions</h2><div className="mt-10 space-y-8"><div><h3 className="font-semibold">Can I cancel anytime?</h3><p className="mt-2 text-sm leading-relaxed text-gray-400">Yes — cancel any paid plan from your Stripe billing portal. Features remain active until the end of your billing period.</p></div><div><h3 className="font-semibold">What happens if I downgrade?</h3><p className="mt-2 text-sm leading-relaxed text-gray-400">Your documents remain safe. Free accounts can scan locally and keep basic storage; paid cloud storage access ends according to your plan.</p></div><div><h3 className="font-semibold">Do I need a credit card to scan?</h3><p className="mt-2 text-sm leading-relaxed text-gray-400">No. Scanning and local PDF downloads are free. A card is only needed for a paid plan with cloud storage and additional modules.</p></div></div></div></section>
    <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-800/50 py-5 text-xs text-gray-600">{[["/privacy","Privacy"],["/terms","Terms"],["/contact","Contact"],["/faq","FAQ"],["/changelog","Changelog"],["/about","About"],["/pricing","Pricing"]].map(([to,label]) => <Link key={to} to={to as "/pricing"} className="hover:text-indigo-400">{label}</Link>)}</footer>
  </main>;
}

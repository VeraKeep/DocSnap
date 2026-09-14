import { createFileRoute } from "@tanstack/react-router";
import { HomeSnapApp } from "~/features/homesnap/components/HomeSnapApp";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

function optionalId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isInteger(n) && n > 0) return n;
  }
  return undefined;
}

export const Route = createFileRoute("/homesnap")({
  validateSearch: (search: Record<string, unknown>) => ({ property: optionalId(search.property), object: optionalId(search.object) }),
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "HomeSnap — DocSnap" }, { name: "description", content: "A permanent digital record of your home — systems, appliances, warranties, receipts, and repair history. Sign in required." }] }),
  component: HomeSnapPage,
});

function HomeSnapPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="HomeSnap" title="Your home, permanently on record." description="Keep warranties, manuals, receipts, photos, systems, appliances, and repair history organized around the things in your home." />
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "homesnap" }} />
        <HomeSnapApp />
      </section>
    </main>
  );
}

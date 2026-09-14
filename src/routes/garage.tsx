import { createFileRoute } from "@tanstack/react-router";
import { GarageSnapApp } from "~/features/garagesnap/components/GarageSnapApp";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/garage")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "GarageSnap — Workshop Inventory | DocSnap" }, { name: "description", content: "GarageSnap, a DocSnap module — inventory tools and equipment with photos, make/model and serial numbers, warranties, and storage locations. Sign in required." }] }),
  component: GaragePage,
});

function GaragePage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="GarageSnap" title="Know what you own." description="Document tools, equipment, serial numbers, receipts, warranties, maintenance records, and storage locations in one workshop inventory." />
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "garagesnap" }} />
        <GarageSnapApp />
      </section>
    </main>
  );
}

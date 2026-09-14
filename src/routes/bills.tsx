import { createFileRoute } from "@tanstack/react-router";
import { BillLibrary } from "~/features/billsnap/components/BillLibrary";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/bills")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "BillSnap — DocSnap" }, { name: "description", content: "Snap the bill, know what you owe and when. Track vendors, due dates, amounts, and get reminders. Sign in required." }] }),
  component: BillsPage,
});

function BillsPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="BillSnap" title="Stay on top of it." description="Turn bills into structured records with vendors, amounts, due dates, payment status, reminders, and automatic charge-change detection." />
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "billsnap" }} />
        <BillLibrary />
      </section>
    </main>
  );
}

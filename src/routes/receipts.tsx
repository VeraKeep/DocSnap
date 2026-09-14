import { createFileRoute } from "@tanstack/react-router";
import { ReceiptLibrary } from "~/features/receiptsnap/components/ReceiptLibrary";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "ReceiptSnap — DocSnap" }, { name: "description", content: "Your receipts, searchable forever — capture, extract, and find any purchase in seconds. Sign in required." }] }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="ReceiptSnap" title="Receipts when you need them." description="Scan and organize receipts, extract purchase details, keep warranty information attached, and find any purchase in seconds." />
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "receiptsnap" }} />
        <ReceiptLibrary />
      </section>
    </main>
  );
}

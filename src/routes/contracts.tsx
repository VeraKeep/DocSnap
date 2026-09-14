import { createFileRoute } from "@tanstack/react-router";
import { ContractLibrary } from "~/features/contractsnap/components/ContractLibrary";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/contracts")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "ContractSnap — DocSnap" }, { name: "description", content: "Upload the contract. Know what you agreed to — ContractSnap extracts renewals, deadlines, and obligations into a plain-language summary with a contract timeline." }] }),
  component: ContractsPage,
});

function ContractsPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="ContractSnap" title="Contracts made simple." description="Store and organize agreements, surface renewals and deadlines, and keep obligations visible with a plain-language summary and timeline." />
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "contractsnap" }} />
        <ContractLibrary />
      </section>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { BookLibrary } from "~/features/booksnap/components/BookLibrary";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";
import { ModulePageHeader } from "~/components/ModulePageHeader";

export const Route = createFileRoute("/books")({
  head: () => ({ meta: [{ name: "robots", content: "index, follow" }, { title: "BookSnap — DocSnap" }, { name: "description", content: "Turn your books into searchable memory — BookSnap keeps every book, edition, page, and quote on your shelf." }] }),
  component: BooksPage,
});

function BooksPage() {
  return (
    <main className="min-h-screen bg-[#020914] text-white">
      <ModulePageHeader name="BookSnap" title="Build your library." description="Catalog books, keep editions and source text on record, and make your shelf searchable without losing where each idea came from." />
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "booksnap" }} />
        <BookLibrary />
      </section>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { BookLibrary } from "~/features/booksnap/components/BookLibrary";
import { CheckoutSuccessBanner } from "~/components/CheckoutSuccessBanner";

export const Route = createFileRoute("/books")({
  head: () => ({
    meta: [
      { title: "Books — DocSnap" },
      {
        name: "description",
        content:
          "Turn your books into searchable memory — BookSnap keeps every book, edition, page, and quote on your shelf.",
      },
    ],
  }),
  component: BooksPage,
});

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          d="M12 16h40M12 16v32h40V16M12 32h40"
          stroke="#fff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * BookSnap module entry: /books renders the bookshelf (auth gate, add-a-book
 * form with manual metadata + optional PDF text ingest, and a bookshelf
 * list/delete view) in DocSnap's dark gray/indigo treatment. The module is
 * self-contained on this route — the root shell supplies the Clerk provider,
 * scripts, and footer.
 */
function BooksPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800/50 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-indigo-400"
        >
          <Logo />
          DocSnap
        </Link>
        <Link to="/scan" className="text-sm text-gray-400 transition hover:text-gray-200">
          ← Back to app
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <CheckoutSuccessBanner destination={{ kind: "module", module: "booksnap" }} />
        <p className="text-sm font-medium text-indigo-400">BookSnap</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Books become searchable memory.
        </h1>
        <p className="mt-3 max-w-xl text-gray-400">
          Instead of remembering books, remember ideas. Add a book to your shelf with its metadata
          and full text on record — every edition, page, and quote traces back to the source.
        </p>
        <BookLibrary />
      </section>
    </main>
  );
}

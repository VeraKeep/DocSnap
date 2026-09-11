import { Link } from "@tanstack/react-router";

export function BlogLoading() {
  return (
    <main className="min-h-screen bg-gray-950 px-6 py-16 text-white" aria-busy="true">
      <div className="mx-auto max-w-5xl">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-800" />
        <div className="mt-8 h-10 max-w-xl animate-pulse rounded bg-gray-800" />
        <div className="mt-4 h-5 max-w-2xl animate-pulse rounded bg-gray-900" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-72 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" />
          ))}
        </div>
        <span className="sr-only">Loading the DocSnap blog</span>
      </div>
    </main>
  );
}

export function BlogNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6 text-center text-white">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">404</p>
        <h1 className="mt-3 text-3xl font-bold">Post not found</h1>
        <p className="mt-3 text-gray-400">That article may have moved or is no longer published.</p>
        <Link to="/blog" className="mt-8 inline-flex rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold hover:bg-indigo-500">
          Browse the blog
        </Link>
      </div>
    </main>
  );
}

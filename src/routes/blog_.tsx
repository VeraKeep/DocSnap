import type { Post } from "@opinly/backend";
import { imageUrl } from "@opinly/shared";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BlogLoading } from "~/components/BlogStates";
import { opinly, opinlyConfig } from "~/opinly";
import { canonicalUrl } from "~/siteConfig";

type BlogSearch = { cursor?: string };

export const Route = createFileRoute("/blog_")({
  validateSearch: (search: Record<string, unknown>): BlogSearch => ({
    cursor:
      typeof search.cursor === "string" && search.cursor.length > 0
        ? search.cursor
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: ({ deps }) => opinly.posts({ limit: 12, cursor: deps.cursor }),
  head: () => ({
    meta: [
      { title: "DocSnap Blog — Practical document and home organization" },
      {
        name: "description",
        content:
          "Practical guides for organizing documents, receipts, bills, contracts, books, home records, and everything important you need to find again.",
      },
      { property: "og:title", content: "DocSnap Blog" },
      {
        property: "og:description",
        content: "Practical document and home-organization guides from DocSnap.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/blog") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/blog") }],
  }),
  pendingComponent: BlogLoading,
  component: BlogIndex,
});

function PostCard({ post }: { post: Post }) {
  const published = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(post.firstPublishedAt));

  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 transition hover:-translate-y-0.5 hover:border-indigo-500/60">
      {post.image?.fileKey ? (
        <img
          src={imageUrl(post.image.fileKey, opinlyConfig)}
          alt={post.image.alt ?? ""}
          title={post.image.title ?? undefined}
          loading="lazy"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-indigo-950 to-gray-900 text-3xl" aria-hidden="true">
          ◇
        </div>
      )}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <time dateTime={post.firstPublishedAt}>{published}</time>
          {post.category ? <><span aria-hidden="true">·</span><span>{post.category.name}</span></> : null}
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug text-white group-hover:text-indigo-300">
          <Link to="/blog/$slug" params={{ slug: post.slug }}>{post.title}</Link>
        </h2>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-400">{post.description}</p>
        <Link
          to="/blog/$slug"
          params={{ slug: post.slug }}
          className="mt-5 inline-flex text-sm font-semibold text-indigo-400 hover:text-indigo-300"
          aria-label={`Read ${post.title}`}
        >
          Read article <span className="ml-1" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function BlogIndex() {
  const posts = Route.useLoaderData();
  const search = Route.useSearch();

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800/70 bg-gray-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-bold tracking-tight">DocSnap</Link>
          <span className="text-sm font-medium text-indigo-400">The organized life</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">DocSnap Blog</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Find it when you need it.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-400">
          Practical ways to organize the documents, purchases, projects, and records that keep life moving.
        </p>

        {posts.data.length === 0 ? (
          <div className="mt-14 rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-16 text-center">
            <h2 className="text-xl font-semibold">The first article is on its way</h2>
            <p className="mt-2 text-gray-400">Check back soon for practical organization guides.</p>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data.map((post) => <PostCard key={post.slug} post={post} />)}
          </div>
        )}

        <nav className="mt-12 flex items-center justify-between" aria-label="Blog pagination">
          {search.cursor ? (
            <Link to="/blog" search={{}} className="rounded-full border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white">
              ← Newest posts
            </Link>
          ) : <span />}
          {posts.has_more && posts.next_cursor ? (
            <Link
              to="/blog"
              search={{ cursor: posts.next_cursor }}
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              More posts →
            </Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}

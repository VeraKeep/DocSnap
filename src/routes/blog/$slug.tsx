import { OpinlyContent } from "@opinly/react";
import { buildBlogPostingJsonLd, buildMetadata } from "@opinly/shared";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { BlogLoading, BlogNotFound } from "~/components/BlogStates";
import { opinly, opinlyConfig } from "~/opinly";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await opinly.post(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};

    const metadata = buildMetadata({ type: "post", data: loaderData }, opinlyConfig);
    const jsonLd = buildBlogPostingJsonLd(
      {
        title: loaderData.title,
        description: loaderData.description,
        content: loaderData.content,
        firstPublishedAt: loaderData.firstPublishedAt,
        modifiedAt: loaderData.modifiedAt,
        author: loaderData.author,
        imageFileKey: loaderData.titleFile?.fileKey,
      },
      opinlyConfig,
    );

    return {
      meta: [
        { title: metadata.title },
        ...(metadata.description ? [{ name: "description", content: metadata.description }] : []),
        { property: "og:title", content: metadata.title },
        ...(metadata.description ? [{ property: "og:description", content: metadata.description }] : []),
        { property: "og:type", content: metadata.ogType ?? "article" },
        ...(metadata.canonicalUrl ? [{ property: "og:url", content: metadata.canonicalUrl }] : []),
        ...(metadata.ogImage ? [{ property: "og:image", content: metadata.ogImage }] : []),
        ...(metadata.publishedTime ? [{ property: "article:published_time", content: metadata.publishedTime }] : []),
        ...(metadata.modifiedTime ? [{ property: "article:modified_time", content: metadata.modifiedTime }] : []),
      ],
      links: metadata.canonicalUrl ? [{ rel: "canonical", href: metadata.canonicalUrl }] : [],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        },
      ],
    };
  },
  pendingComponent: BlogLoading,
  notFoundComponent: BlogNotFound,
  component: BlogPost,
});

function BlogPost() {
  const post = Route.useLoaderData();
  const published = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(post.firstPublishedAt));

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-lg font-bold tracking-tight">DocSnap</Link>
          <Link to="/blog" className="text-sm font-medium text-gray-400 hover:text-white">Blog</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        {post.category ? (
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-400">{post.category.name}</p>
        ) : null}
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
        <p className="mt-5 text-xl leading-8 text-gray-400">{post.description}</p>
        <div className="mt-7 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          {post.author ? <span>By {post.author.name}</span> : null}
          {post.author ? <span aria-hidden="true">·</span> : null}
          <time dateTime={post.firstPublishedAt}>{published}</time>
        </div>

        {post.titleFile?.fileKey ? (
          <img
            src={`/images/${post.titleFile.fileKey}`}
            alt={post.titleFile.altText ?? ""}
            title={post.titleFile.title ?? undefined}
            className="mt-10 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ) : null}

        <div className="mt-12 text-gray-300">
          <OpinlyContent
            content={post.content}
            config={{ imagesPrefix: "/images", siteUrl: "https://docsnapapp.com", blogPrefix: "/blog", siteName: "DocSnap Blog" }}
            classNames={{
              paragraph: "my-5 text-base leading-8 text-gray-300",
              heading: "mb-4 mt-10 scroll-mt-8 font-bold tracking-tight text-white",
              image: "my-8 h-auto max-w-full rounded-xl",
              bulletList: "my-6 list-disc space-y-2 pl-6",
              orderedList: "my-6 list-decimal space-y-2 pl-6",
              listItem: "pl-1 leading-7",
              blockquote: "my-8 border-l-4 border-indigo-500 pl-5 italic text-gray-400",
              code: "rounded bg-gray-800 px-1.5 py-0.5 font-mono text-sm text-indigo-200",
              codeBlock: "my-8 overflow-x-auto rounded-xl border border-gray-800 bg-black p-5 font-mono text-sm",
              horizontalRule: "my-10 border-gray-800",
              table: "my-8 w-full border-collapse overflow-hidden rounded-xl text-left text-sm",
              link: "font-medium text-indigo-400 underline decoration-indigo-500/50 underline-offset-4 hover:text-indigo-300",
            }}
          />
        </div>

        <aside className="mt-16 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-7 text-center">
          <h2 className="text-xl font-semibold">Turn paperwork into something useful</h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">Scan documents into clean, searchable PDFs directly in your browser.</p>
          <Link to="/scan" className="mt-5 inline-flex rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold hover:bg-indigo-500">Try DocSnap</Link>
        </aside>
      </article>
    </main>
  );
}

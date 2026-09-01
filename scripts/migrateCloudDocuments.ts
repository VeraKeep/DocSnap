/**
 * One-time migration: move cloud document METADATA from the server filesystem
 * (`data/<userId>.json`) into the Postgres `cloud_documents` table.
 *
 * Background: src/cloudStorage.ts previously persisted each user's cloud
 * documents to a local `data/<userId>.json` file. On Vercel/serverless that
 * filesystem is NOT durable, so metadata now lives in Neon/Postgres.
 * This script reads any remaining `data/*.json` files and inserts their rows
 * into `cloud_documents`, so no existing user's cloud document record is lost.
 *
 * IDEMPOTENT: re-running is safe. Each row's `id` is the CloudDocument.id
 * (globally unique PRIMARY KEY), so `ON CONFLICT (id) DO NOTHING` skips any
 * document that already exists in Postgres. Run against the live Neon DB:
 *   bun scripts/migrateCloudDocuments.ts
 *
 * This only READS the filesystem — it never writes to it. After a successful
 * run, cloudStorage.ts is fully backed by Postgres.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "../src/db";

function dataDir(): string {
  return fileURLToPath(new URL("../data", import.meta.url));
}

function normalize(doc: Record<string, unknown>) {
  return {
    id: String(doc.id),
    name: String(doc.name ?? ""),
    pageCount: Number(doc.pageCount ?? 0),
    date: String(doc.date ?? new Date().toISOString()),
    fileKey: String(doc.fileKey ?? ""),
    fileUrl: String(doc.fileUrl ?? ""),
    thumbnailUrl: doc.thumbnailUrl ? String(doc.thumbnailUrl) : null,
    autoCategory: String(doc.autoCategory ?? ""),
    userCategory: doc.userCategory ? String(doc.userCategory) : null,
    ocrText: String(doc.ocrText ?? ""),
    contentHash: String(doc.contentHash ?? ""),
  };
}

async function main() {
  const dir = dataDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("No data/ directory found — nothing to migrate.");
    return;
  }
  if (files.length === 0) {
    console.log("No data/*.json files found — nothing to migrate.");
    return;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  const perUser: { user: string; files: number; inserted: number; skipped: number }[] = [];

  for (const file of files) {
    const userId = file.replace(/\.json$/, "");
    let docs: unknown[];
    try {
      docs = JSON.parse(readFileSync(join(dir, file), "utf-8")) as unknown[];
    } catch {
      console.warn(`  skip ${file}: could not parse JSON`);
      continue;
    }
    if (!Array.isArray(docs)) {
      console.warn(`  skip ${file}: not a JSON array of documents`);
      continue;
    }

    let inserted = 0;
    let skipped = 0;
    for (const raw of docs) {
      if (!raw || typeof raw !== "object") continue;
      const d = normalize(raw as Record<string, unknown>);
      // owner-scoped by user id; idempotent on the unique doc id.
      // RETURNING id is empty when the row already existed (ON CONFLICT
      // DO NOTHING), so it cleanly separates newly-inserted from already-present.
      const res = await sql`
        INSERT INTO cloud_documents (
          id, clerk_user_id, name, page_count, date, file_key, file_url,
          thumbnail_url, auto_category, user_category, ocr_text, content_hash
        ) VALUES (
          ${d.id}, ${userId}, ${d.name}, ${d.pageCount}, ${d.date},
          ${d.fileKey}, ${d.fileUrl}, ${d.thumbnailUrl},
          ${d.autoCategory}, ${d.userCategory}, ${d.ocrText}, ${d.contentHash}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if ((res as unknown as { id: string }[]).length > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    perUser.push({ user: userId, files: 1, inserted, skipped });
    console.log(
      `  ${userId}: ${docs.length} doc(s) in file → inserted=${inserted} alreadyPresent=${skipped}`,
    );
  }

  console.log("MIGRATION SUMMARY");
  for (const p of perUser) {
    console.log(
      `  user=${p.user} files=${p.files} inserted=${p.inserted} alreadyPresent=${p.skipped}`,
    );
  }
  console.log(`TOTAL inserted=${totalInserted} alreadyPresent=${totalSkipped}`);
  console.log(
    "Rows now in cloud_documents by owner: " +
      (await sql`SELECT clerk_user_id, COUNT(*)::int AS n FROM cloud_documents GROUP BY clerk_user_id ORDER BY clerk_user_id`)
        .map((r) => `${String(r.clerk_user_id)}=${Number(r.n)}`)
        .join(", "),
  );
  console.log("Migration complete (idempotent — safe to re-run).");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

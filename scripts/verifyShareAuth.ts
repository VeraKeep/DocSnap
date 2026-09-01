/**
 * Verify secure-share auth is header-only (password NEVER accepted via the
 * URL query string) against the live Neon DB, then clean up after itself.
 *
 * Exercises the REAL route handler `GET` from src/routes/api/-share.ts, which
 * is the exact code mounted by serve.ts at /api/share/:id:
 *
 *   1. ?password= in the URL + NO Basic header        -> 401 "password_required"
 *        (proves the query string is now ignored — a regression guard)
 *   2. no header, no query                             -> 401 "password_required"
 *   3. wrong password in the Basic header              -> 401 "Incorrect password"
 *   4. correct password in the Basic header            -> passes the gate
 *        (a self-contained share_links row with a non-existent document id
 *         yields 410 "Shared document no longer exists" after the password
 *         check passes — status != 401 proves the password was accepted)
 *   5. a share with NO password, no credentials        -> NOT gated (public)
 *   6. source invariant: neither the API handler nor the share view builds a
 *        `?password=`/`password=` query string for /api/share
 *
 * Run:  bun scripts/verifyShareAuth.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { GET as shareGET } from "../src/routes/api/-share";
import {
  createShareLink,
  getShareLink,
  hashSharePassword,
} from "../src/db/shareLinks";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set - nothing to verify.");
  process.exit(1);
}
const raw = neon(databaseUrl, { fetchOptions: { cache: "no-store" } });

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
function basicAuth(pw: string): string {
  return "Basic " + Buffer.from(`share:${pw}`).toString("base64");
}
async function readBody(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function main() {
  const ownerUserId = "vrfy-secure-share-user";
  const pw = "vrfy-secure-pw-0";

  const link = await createShareLink({
    documentId: "vrfy-doc-missing-0",
    ownerUserId,
    passwordHash: await hashSharePassword(pw),
  });
  if (!link) fail("could not create test share link");
  const base = `https://example.com/api/share/${link.id}`;
  console.log("OK  created password-protected test share link");

  // 1) Query string ONLY (no Basic header) must NOT satisfy the password.
  const qUrl = `${base}?password=${encodeURIComponent(pw)}`;
  const q = await shareGET(new Request(qUrl), link.id);
  const qBody = await readBody(q);
  if (q.status !== 401 || qBody.error !== "password_required") {
    fail(
      `query-string password was ACCEPTED (url leak regression). status=${q.status} body=${JSON.stringify(qBody)}`,
    );
  }
  console.log("OK  ?password= in URL alone -> 401 password_required (query ignored)");

  // 2) No header, no query.
  const m = await shareGET(new Request(base), link.id);
  const mBody = await readBody(m);
  if (m.status !== 401 || mBody.error !== "password_required") {
    fail(`no credentials -> expected 401 password_required, got ${m.status} ${JSON.stringify(mBody)}`);
  }
  console.log("OK  no credentials -> 401 password_required");

  // 3) Wrong password in the Basic header.
  const w = await shareGET(new Request(base, { headers: { Authorization: basicAuth("wrong-pw") } }), link.id);
  const wBody = await readBody(w);
  if (w.status !== 401 || wBody.error !== "Incorrect password") {
    fail(`wrong password -> expected 401 "Incorrect password", got ${w.status} ${JSON.stringify(wBody)}`);
  }
  console.log("OK  wrong Basic password -> 401 'Incorrect password'");

  // 4) Correct password in the Basic header -> password gate passes.
  const c = await shareGET(new Request(base, { headers: { Authorization: basicAuth(pw) } }), link.id);
  const cBody = await readBody(c);
  if (c.status === 401) {
    fail(`correct password was REJECTED via header: ${JSON.stringify(cBody)}`);
  }
  if (c.status !== 410) {
    fail(`expected 410 doc-missing after password pass (self-contained row), got ${c.status} ${JSON.stringify(cBody)}`);
  }
  console.log("OK  correct Basic password -> password gate passes (proceeds to doc lookup -> 410)");

  // Alias for GET idempotence sanity: the row still resolves.
  const still = await getShareLink(link.id);
  if (!still) fail("share link row vanished mid-test");

  // 5) A share with NO password and no credentials must NOT be gated.
  const link2 = await createShareLink({
    documentId: "vrfy-doc-missing-1",
    ownerUserId,
    passwordHash: null,
  });
  if (!link2) fail("could not create public test share link");
  const n = await shareGET(new Request(`https://example.com/api/share/${link2.id}`), link2.id);
  if (n.status === 401) fail("public (no-password) share was wrongly gated");
  console.log(`OK  public share (no password) not gated (status ${n.status})`);
  await raw.query("DELETE FROM share_links WHERE id = $1", [link2.id]);

  // 6) Source invariant: no ?password=/password= built for /api/share.
  const apiSrc = readFileSync(join(process.cwd(), "src/routes/api/-share.ts"), "utf8");
  const viewSrc = readFileSync(join(process.cwd(), "src/routes/share/$id.tsx"), "utf8");
  if (/password=/.test(apiSrc)) {
    fail("src/routes/api/-share.ts still references a password= query parameter");
  }
  if (/password=/.test(viewSrc)) {
    fail("src/routes/share/$id.tsx still builds a password= query parameter");
  }
  console.log("OK  source invariant holds: no password= query string in share API or share view");

  // Cleanup.
  await raw.query("DELETE FROM share_links WHERE id = $1", [link.id]);
  const gone = await getShareLink(link.id);
  if (gone) fail("test share link not cleaned up");
  console.log("OK  test rows cleaned up");
  console.log("\nPASS: secure-share auth is header-only (no password in URL); gate distinguishability verified.");
}

main().catch((err) => fail(String(err?.message ?? err)));

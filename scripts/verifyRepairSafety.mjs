// Execute production TypeScript with isolated service adapters; no live accounts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import Stripe from "stripe";

const root = path.resolve(import.meta.dirname, "..");
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const module = { exports: {} };
  const require = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (id) => id in mocks ? mocks[id] : require(id),
    process, Buffer, Request, Response, FormData, File, Uint8Array, AbortSignal, URL,
    fetch: mocks.__fetch ?? (() => { throw new Error("Unexpected network call"); }),
    console: { log() {}, warn() {}, error() {} },
  }, { filename });
  return module.exports;
}

process.env.BILLSNAP_INBOUND_DOMAIN = "inbound.docsnapapp.com";
let tokenRows = [{ clerk_user_id: "user_owner" }];
const addresses = load("src/features/billsnap/inboundAddress.ts", { "~/db": { sql: async () => tokenRows } });
const legacy = "AbCdEfGhIjKlMnOpQrStUvWxYz123456";
assert.equal(addresses.parseRecipient(`Owner <BILLS+${legacy}@INBOUND.DOCSNAPAPP.COM>`).token, legacy);
assert.match(addresses.generateInboundToken(), /^[a-f0-9]{48}$/);
assert.equal((await addresses.resolveOwnerFromRecipient(`bills+${legacy}@elsewhere.test`)).clerkUserId, null);
assert.equal((await addresses.resolveOwnerFromRecipient(`bills+${legacy.toLowerCase()}@inbound.docsnapapp.com`)).clerkUserId, "user_owner");
tokenRows = [{ clerk_user_id: "user_a" }, { clerk_user_id: "user_b" }];
assert.equal(await addresses.lookupClerkUserByInboundToken(legacy), null);
assert.equal(addresses.parseRecipient(`other+${legacy}@inbound.docsnapapp.com`).token, null);

process.env.BILLSNAP_INBOUND_SECRET = "test-inbound-secret";
let ingested;
const inbound = load("src/routes/api/-billsnap-email-inbound.ts", {
  "~/features/billsnap/inboundAddress": { resolveOwnerFromRecipient: async () => ({ clerkUserId: "user_owner" }) },
  "~/features/billsnap/emailIngest": { ingestBillFromEmail: async (data) => { ingested = data; return { ok: true }; } },
});
for (const format of ["json", "multipart"]) {
  const fields = { secret: "test-inbound-secret", to: `bills+${legacy}@inbound.docsnapapp.com`, text: "Invoice 42" };
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const request = new Request("https://example.test/api/billsnap-email-inbound", {
    method: "POST", body: format === "json" ? JSON.stringify(fields) : form,
    headers: format === "json" ? { "content-type": "application/json" } : {},
  });
  assert.equal((await inbound.POST(request)).status, 200);
  assert.equal(ingested.bodyText, "Invoice 42");
  assert.equal(ingested.owner.clerkUserId, "user_owner");
}
assert.equal((await inbound.POST(new Request("https://example.test", { method: "POST", body: "{}" }))).status, 401);

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.DATABASE_URL = "test-only";
let grants = 0, failGrant = false, revocations = 0;
const webhook = load("src/routes/api/-stripe-webhook.ts", {
  "../../db": { sql: async () => [] },
  "../../subscription": { findUserByEmail: async () => "user_test", findUserByStripeCustomerId: async () => "user_test" },
  "../../entitlements": {
    applyEntitlementToUser: async () => { if (failGrant) throw new Error("DB unavailable"); grants++; return "granted"; },
    enqueuePendingEntitlement: async () => {}, reconcilePendingEntitlements: async () => 0,
  },
  "../../revokeEntitlement": { revokeSubscriptionEntitlement: async () => { revocations++; } },
});
async function deliver(type, object, signatureOverride) {
  const payload = JSON.stringify({ id: "evt_test", type, data: { object } });
  const signature = signatureOverride ?? Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
  return webhook.POST(new Request("https://example.test/api/stripe-webhook", {
    method: "POST", body: payload, headers: { "stripe-signature": signature },
  }));
}
const checkout = { id: "cs_test", client_reference_id: "user_test", metadata: { price_id: "price_test" } };
assert.equal((await deliver("checkout.session.completed", { ...checkout, payment_status: "unpaid" })).status, 200);
assert.equal(grants, 0);
assert.equal((await deliver("checkout.session.async_payment_succeeded", { ...checkout, payment_status: "paid" })).status, 200);
assert.equal(grants, 1);
failGrant = true;
assert.equal((await deliver("checkout.session.completed", { ...checkout, payment_status: "paid" })).status, 500);
failGrant = false;
assert.equal((await deliver("checkout.session.completed", { ...checkout, payment_status: "paid" })).status, 200);
assert.equal((await deliver("checkout.session.completed", checkout, "invalid")).status, 400);
await deliver("customer.subscription.updated", { status: "unpaid", customer: "cus_test", metadata: {} });
assert.equal(revocations, 1);

const dbFailure = { sql: async () => { throw new Error("DB unavailable"); } };
const serverFunctions = { createServerFn: () => ({ handler: (fn) => fn, validator() { return this; } }) };
const subscription = load("src/subscription.ts", { "./db": dbFailure, "./entitlements": { reconcilePendingEntitlements: async () => 0 }, "./serverAuth": {}, "@tanstack/react-start": serverFunctions });
await assert.rejects(() => subscription.setBillSnapAddon("user_test", true), /DB unavailable/);
await assert.rejects(() => subscription.setSubscriptionTier("user_test", "personal", "cus_test"), /DB unavailable/);
const entitlements = load("src/entitlements.ts", { "./db": dbFailure, "./subscription": {} });
await assert.rejects(() => entitlements.enqueuePendingEntitlement({ email: "test@example.test" }), /DB unavailable/);
const revoke = load("src/revokeEntitlement.ts", {
  "./entitlements": { PRICE_ENTITLEMENTS: {} },
  "./subscription": { setFreeSubscription() { throw new Error("Unknown price must not change access"); } },
});
await revoke.revokeSubscriptionEntitlement("user_test", { items: { data: [] } });

process.env.UPLOADTHING_SECRET = "test-upload-secret";
const audio = load("src/features/meetingsnap/audioAuthorization.ts");
const url = "https://example.ufs.sh/f/recording-key";
const permit = audio.authorizeAudioUpload("user_test", url);
audio.verifyAudioUpload(permit, "user_test", url);
assert.throws(() => audio.verifyAudioUpload(permit, "user_other", url));
assert.throws(() => audio.verifyAudioUpload(permit, "user_test", url + "other"));
assert.throws(() => audio.verifyAudioUpload(permit.slice(0, -4), "user_test", url));
for (const unsafe of ["https://127.0.0.1/f/key", "https://example.ufs.sh.attacker.test/f/key", "https://user:pass@example.ufs.sh/f/key", "https://example.ufs.sh/f/key?url=internal"]) {
  assert.throws(() => audio.validateAudioUrl(unsafe));
}
assert.equal((await audio.readAudioBytes(new Response("audio"))).byteLength, 5);
await assert.rejects(() => audio.readAudioBytes(new Response("small", { headers: { "content-length": String(audio.MAX_AUDIO_BYTES + 1) } })), /25 MB/);
await assert.rejects(() => audio.readAudioBytes(new Response(new Uint8Array(audio.MAX_AUDIO_BYTES + 1))), /25 MB/);
const usage = load("src/features/meetingsnap/usage.ts", { "~/db": dbFailure, "./tiers": { normalizeMeetingTier: () => "free", MEETING_TIERS: { free: { meetingsPerMonth: 2 } } } });
await assert.rejects(() => usage.getMeetingsUsage("user_test"), /could not be verified/);
delete process.env.DATABASE_URL;
assert.equal((await deliver("checkout.session.completed", checkout)).status, 503);
await assert.rejects(() => usage.getMeetingsUsage("user_test"), /not configured/);
console.log("PASS: inbound email, signed payments/retries, recording authorization, byte limits, and fail-closed usage.");

// Exercise the actual transcript handler: denied quota never reaches AI;
// usage/AI/persistence failures always release the temporary reservation.
const tiers = load("src/features/meetingsnap/tiers.ts");
let quotaDenied = false, usageDenied = false, saveDenied = false, aiDenied = false;
let releases = 0, aiCalls = 0, completions = 0;
process.env.OPENAI_API_KEY = "test-only";
const meetingServer = load("src/features/meetingsnap/server.ts", {
  "@tanstack/react-start": { ...serverFunctions, createServerOnlyFn: fn => fn },
  "~/db": { sql: async () => [{ meeting_subscription_status: "free" }] },
  "~/lib/server-auth": { requireServerFunctionUser: async () => "user_test" },
  "./types": load("src/features/meetingsnap/types.ts"), "./tiers": tiers,
  "./usage": { getMeetingsUsage: async () => {
    if (usageDenied) throw new Error("Usage unavailable");
    return { usedThisMonth: 1, allowed: 2, tier: "free" };
  } },
  "./persistence": {
    reserveMeeting: async () => {
      if (quotaDenied) throw new Error("Allowance exhausted");
      return { id: 12, tier: "free", createdAt: new Date().toISOString() };
    },
    completeMeeting: async () => { if (saveDenied) throw new Error("Save failed"); completions++; },
    releaseMeeting: async () => { releases++; },
  },
  __fetch: async () => {
    aiCalls++;
    if (aiDenied) throw new Error("AI failed");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "Saved summary" }) } }] }), { status: 200 });
  },
});
const transcriptInput = { data: { title: "Meeting", sourceText: "A sufficiently long meeting transcript." } };
quotaDenied = true;
await assert.rejects(() => meetingServer.analyzeMeeting(transcriptInput), /Allowance/);
assert.equal(aiCalls, 0); assert.equal(releases, 0);
quotaDenied = false; usageDenied = true;
await assert.rejects(() => meetingServer.analyzeMeeting(transcriptInput), /Usage/);
assert.equal(aiCalls, 0); assert.equal(releases, 1);
usageDenied = false; aiDenied = true;
await assert.rejects(() => meetingServer.analyzeMeeting(transcriptInput), /AI failed/);
assert.equal(releases, 2);
aiDenied = false; saveDenied = true;
await assert.rejects(() => meetingServer.analyzeMeeting(transcriptInput), /Save failed/);
assert.equal(releases, 3);
saveDenied = false;
const analyzed = await meetingServer.analyzeMeeting(transcriptInput);
assert.equal(analyzed.meeting.id, 12); assert.equal(analyzed.usage.usedThisMonth, 1);
assert.equal(completions, 1); assert.equal(releases, 3);
const priorAI = aiCalls;
await assert.rejects(() => meetingServer.askAI({ data: { question: "Summarize" } }), /plan/);
await assert.rejects(() => meetingServer.draftFollowUpEmail({ data: { id: 12 } }), /plan/);
assert.equal(aiCalls, priorAI);
console.log("PASS: meeting quota before AI, reservation cleanup, atomic save handoff, and paid feature gates.");

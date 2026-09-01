/**
 * Verify the UploadThing uploader auth/entitlement gate FAILS CLOSED.
 *
 * The three uploaders in src/uploadthing.ts each run `gateUpload` (the single
 * decision function shared by all middleware) after verifying the Clerk session
 * and reading the live-DB entitlement. This script unit-tests that decision
 * function over every reject/allow path, since the middleware itself cannot be
 * exercised end-to-end in-sandbox (it needs a real Clerk session token AND a
 * live UploadThing presign involving storage/bandwidth — see NOTES at the end).
 *
 * Run:  bun scripts/verifyUploadAuth.ts
 */
import { gateUpload } from "../src/uploadAuth";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
function ok(msg: string) {
  console.log(`  ok: ${msg}`);
}

async function main() {
  console.log("UploadThing uploader auth/entitlement gate (unit):");

  // ── pdfUploader: requires a signed-in user, no entitlement requirement ──
  const pdfAnon = gateUpload({ userId: null, kind: "pdf" });
  if (pdfAnon.ok !== false || pdfAnon.reason !== "not-signed-in")
    fail("pdfUploader should reject an anonymous caller (not-signed-in)");
  ok("pdfUploader rejects anonymous caller (auth only)");

  const pdfSignedIn = gateUpload({ userId: "user_123", kind: "pdf" });
  if (pdfSignedIn.ok !== true || pdfSignedIn.uploadedBy !== "user_123")
    fail("pdfUploader should allow any signed-in user");
  if (pdfSignedIn.entitlement !== "docsnap-cloud-documents")
    fail("pdfUploader metadata should label docsnap-cloud-documents");
  ok("pdfUploader allows signed-in user + labels entitlement");

  // ── audioUploader (MeetingSnap): requires meetingsnap !== free ──
  const audioAnon = gateUpload({ userId: null, kind: "audio" });
  if (audioAnon.ok !== false || audioAnon.reason !== "not-signed-in")
    fail("audioUploader should reject anonymous caller");
  ok("audioUploader rejects anonymous caller");

  const audioFree = gateUpload({ userId: "user_123", entitlementOk: false, kind: "audio" });
  if (audioFree.ok !== false || audioFree.reason !== "denied")
    fail("audioUploader should reject a user without paid MeetingSnap (free tier)");
  ok("audioUploader rejects user WITHOUT paid MeetingSnap (meetingsnap=free)");

  const audioPaid = gateUpload({ userId: "user_123", entitlementOk: true, kind: "audio" });
  if (audioPaid.ok !== true || audioPaid.entitlement !== "meetingsnap-paid")
    fail("audioUploader should allow a user with paid MeetingSnap");
  ok("audioUploader allows user WITH paid MeetingSnap");

  // ── imageUploader (GarageSnap): requires garagesnap add-on ──
  const imageAnon = gateUpload({ userId: null, kind: "image" });
  if (imageAnon.ok !== false || imageAnon.reason !== "not-signed-in")
    fail("imageUploader should reject anonymous caller");
  ok("imageUploader rejects anonymous caller");

  const imageNoGarage = gateUpload({ userId: "user_123", entitlementOk: false, kind: "image" });
  if (imageNoGarage.ok !== false || imageNoGarage.reason !== "denied")
    fail("imageUploader should reject a user without GarageSnap");
  ok("imageUploader rejects user WITHOUT GarageSnap");

  const imageGarage = gateUpload({ userId: "user_123", entitlementOk: true, kind: "image" });
  if (imageGarage.ok !== true || imageGarage.entitlement !== "garagesnap")
    fail("imageUploader should allow a user with GarageSnap");
  ok("imageUploader allows user WITH GarageSnap");

  console.log("PASS: all uploader reject/allow paths behave as specified (fail closed).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

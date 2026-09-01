/**
 * Pure decision logic for the UploadThing uploader middleware.
 *
 * Kept dependency-free (no Clerk, no Neon, no TanStack) so the reject paths
 * can be unit-tested deterministically from `scripts/verifyUploadAuth.ts`
 * without spinning up a session or a database. The middleware in
 * `src/uploadthing.ts` wires the verified request user + live entitlement
 * summary into `gateUpload`, then throws (failing closed) when the gate
 * rejects.
 */

export type UploaderKind = "pdf" | "audio" | "image";

export interface UploadGateInput {
  /** Verified Clerk user id, or null when not signed in. */
  userId: string | null;
  /**
   * Whether the user holds the entitlement required by this uploader.
   * `undefined` = this uploader has no entitlement requirement (auth only);
   * `false` = required entitlement is missing → reject.
   */
  entitlementOk?: boolean;
  kind: UploaderKind;
}

export interface UploadGateResult {
  ok: boolean;
  reason?: "not-signed-in" | "denied";
  uploadedBy?: string;
  entitlement?: string;
}

function labelFor(kind: UploaderKind): string {
  switch (kind) {
    case "pdf":
      return "docsnap-cloud-documents";
    case "audio":
      return "meetingsnap-paid";
    case "image":
      return "garagesnap";
  }
}

/**
 * FAILS CLOSED: rejects unless the caller has a signed-in user id AND any
 * entitlement the uploader requires.
 *   - no verified user            → { ok:false, reason:"not-signed-in" }
 *   - user present, entitlement false → { ok:false, reason:"denied" }
 *   - otherwise                   → { ok:true, uploadedBy, entitlement }
 */
export function gateUpload(input: UploadGateInput): UploadGateResult {
  if (!input.userId) return { ok: false, reason: "not-signed-in" };
  if (input.entitlementOk === false) {
    return { ok: false, reason: "denied", uploadedBy: input.userId };
  }
  return {
    ok: true,
    uploadedBy: input.userId,
    entitlement: labelFor(input.kind),
  };
}

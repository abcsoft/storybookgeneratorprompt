/**
 * Per-illustration status model (item 1). Session-scoped — the Studio UI
 * keeps one of these per manifest page while you review/import/regenerate,
 * before ever calling the export APIs.
 */

export type IllustrationStatus =
  | "missing"
  | "added"
  | "needs-regeneration"
  | "approved";

export const ILLUSTRATION_STATUSES: readonly IllustrationStatus[] = [
  "missing",
  "added",
  "needs-regeneration",
  "approved",
];

export const STATUS_LABELS: Record<IllustrationStatus, string> = {
  missing: "Missing",
  added: "Added",
  "needs-regeneration": "Needs regeneration",
  approved: "Approved",
};

/** The status a page gets the moment an image is (re)imported for it — never
 *  "approved" automatically, per spec: approval is always a deliberate,
 *  separate action. */
export function statusAfterImport(): IllustrationStatus {
  return "added";
}

/** The status a page gets when its image is removed. */
export function statusAfterRemove(): IllustrationStatus {
  return "missing";
}

/** The status a page gets when needs-regeneration is cleared. */
export function statusAfterClearRegeneration(current?: IllustrationStatus): IllustrationStatus {
  if (current === "needs-regeneration") return "added";
  return current ?? "added";
}

/** Derive clear, non-conflicting badge display state. */
export function derivePrimaryBadge(entry: {
  status: IllustrationStatus;
  needsRegeneration?: boolean;
  hasCustomTransform?: boolean;
}): { label: string; kind: "missing" | "added" | "needs-regeneration" | "adjusted" | "approved" } {
  if (entry.status === "missing") return { label: "Missing", kind: "missing" };
  if (entry.status === "needs-regeneration" || entry.needsRegeneration) {
    return { label: "Needs regeneration", kind: "needs-regeneration" };
  }
  if (entry.hasCustomTransform) {
    return { label: "Framing Adjusted", kind: "adjusted" };
  }
  if (entry.status === "approved") {
    return { label: "Approved", kind: "approved" };
  }
  return { label: "Added", kind: "added" };
}

/** Whether a status transition is one the UI actually offers. Not a strict
 *  state machine — every status can move to any other via an explicit user
 *  action (Approve / Mark needs-regeneration / Replace / Remove) — this just
 *  guards against marking a page that has no image yet as approved or
 *  needing regeneration, which wouldn't mean anything. */
export function canMarkStatus(
  current: IllustrationStatus,
  target: "approved" | "needs-regeneration",
): boolean {
  if (current === "missing") return false;
  return target !== current;
}

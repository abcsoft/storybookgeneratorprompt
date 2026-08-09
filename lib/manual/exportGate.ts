/**
 * Client-side approval/export gate (item 7). This is layered IN FRONT OF —
 * never a replacement for — the server-side Phase 2 preflight
 * (`lib/print/preflight.ts`), which still runs (and can still refuse to
 * write anything) on every `/api/assemble*` call regardless of what this
 * gate decides. This gate only knows about session-local illustration
 * status, which the server never sees.
 */

import type { IllustrationStatus } from "./illustrationStatus";

export interface ExportGateOptions {
  /** Require every illustration to be "approved" before export is allowed. */
  strict: boolean;
}

export interface ExportGateResult {
  /** true = the export action must not be allowed to run. */
  blocked: boolean;
  /** Hard-blocking reasons, always shown when `blocked`. */
  reasons: string[];
  /** Non-blocking heads-up shown when nothing is blocked but not everything
   *  is approved yet. */
  warning?: string;
}

export function evaluateExportGate(
  inputs: (IllustrationStatus | { status: IllustrationStatus; needsRegeneration?: boolean })[],
  opts: ExportGateOptions,
): ExportGateResult {
  const entries = inputs.map((item) =>
    typeof item === "string" ? { status: item, needsRegeneration: item === "needs-regeneration" } : item,
  );

  const missing = entries.filter((e) => e.status === "missing").length;
  const needsRegeneration = entries.filter(
    (e) => e.status === "needs-regeneration" || e.needsRegeneration === true,
  ).length;
  const notApproved = entries.filter(
    (e) => e.status !== "approved" || e.needsRegeneration === true,
  ).length;

  const reasons: string[] = [];
  if (missing > 0) {
    reasons.push(`${missing} illustration${missing === 1 ? "" : "s"} still missing.`);
  }
  if (needsRegeneration > 0) {
    reasons.push(
      `${needsRegeneration} illustration${needsRegeneration === 1 ? "" : "s"} marked ` +
        `"needs regeneration".`,
    );
  }
  if (opts.strict && notApproved > 0 && missing === 0 && needsRegeneration === 0) {
    reasons.push(
      `Strict mode is on: ${notApproved} illustration${notApproved === 1 ? "" : "s"} ` +
        `${notApproved === 1 ? "isn't" : "aren't"} approved yet.`,
    );
  }

  const blocked = reasons.length > 0;
  const warning =
    !blocked && !opts.strict && notApproved > 0
      ? "Not all images are approved."
      : undefined;

  return { blocked, reasons, warning };
}

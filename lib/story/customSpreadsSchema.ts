/**
 * Strict input validation for `customSpreads`, as posted by the client to
 * POST /api/prompts (and anywhere else a caller hands over raw spread
 * selections). Replaces trusting `as any` at the API boundary.
 *
 * This only validates the request's *shape*: types, allowed side values,
 * adjacent/even-odd facing-pair geometry, and duplicate/overlapping pages
 * within the request itself. It reuses `isValidFacingPair` (the single
 * source of truth for facing-pair geometry, see lib/pdf/imposition.ts)
 * rather than re-deriving those rules here.
 *
 * Whether the requested pages actually exist in the selected book/profile
 * edition is a book-specific fact `resolveLayoutPlan` already checks
 * authoritatively (it knows the real physical page count); this schema does
 * not duplicate that lookup.
 */

import { z } from "zod";
import { isValidFacingPair } from "../pdf/imposition";

const TEXT_SIDES = ["left", "right", "none"] as const;
const SUBJECT_SIDES = ["left", "right", "centered"] as const;

export const customSpreadSchema = z
  .object({
    startPage: z
      .number({ message: "startPage must be a number" })
      .int("startPage must be an integer"),
    endPage: z.number({ message: "endPage must be a number" }).int("endPage must be an integer"),
    textSide: z.enum(TEXT_SIDES, {
      message: `textSide must be one of: ${TEXT_SIDES.join(", ")}`,
    }),
    subjectSide: z
      .enum(SUBJECT_SIDES, {
        message: `subjectSide must be one of: ${SUBJECT_SIDES.join(", ")}`,
      })
      .optional(),
  })
  .superRefine((spread, ctx) => {
    // Geometry only (even start, span of exactly 1, not page 1) — no upper
    // bound here since that depends on the resolved book/profile edition.
    if (!isValidFacingPair(spread.startPage, spread.endPage, Number.MAX_SAFE_INTEGER)) {
      ctx.addIssue({
        code: "custom",
        path: ["startPage"],
        message: `[${spread.startPage}, ${spread.endPage}] is not a valid facing pair — spreads must start on an even physical page and span exactly two consecutive facing pages.`,
      });
    }
  });

export const customSpreadsSchema = z
  .array(customSpreadSchema)
  .superRefine((spreads, ctx) => {
    const claimedBy = new Map<number, number>(); // physical page -> owning spread index
    spreads.forEach((spread, index) => {
      if (spread.endPage < spread.startPage) return; // already flagged per-item
      for (let page = spread.startPage; page <= spread.endPage; page++) {
        const owner = claimedBy.get(page);
        if (owner !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "startPage"],
            message: `Physical page ${page} is claimed by more than one spread (also spread #${owner}).`,
          });
        } else {
          claimedBy.set(page, index);
        }
      }
    });
  });

export type ValidatedCustomSpread = z.infer<typeof customSpreadSchema>;

/** First human-readable issue, formatted as "path: message" for a field-level error. */
export function firstZodIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const path = issue.path.join(".");
  return path ? `customSpreads[${path}]: ${issue.message}` : issue.message;
}

/**
 * POST /api/prompts
 *
 * Free path: returns the 24 personalized prompts (with filenames + page text)
 * and a ready-to-save prompts.md for a child. No Gemini API call — you generate
 * the images yourself in the Gemini app.
 *
 * Every response is JSON, success or failure — never the default Next.js
 * HTML error page — so the client can always tell a validation problem from
 * a genuine server bug. This route must keep working with no enhancement
 * provider, no Real-ESRGAN binary/models, no Vulkan GPU, and no paid-provider
 * secrets configured: it never imports lib/enhance/*, and nothing it does
 * import performs module-level environment validation.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildManifest, renderPromptsMarkdown } from "@/lib/manual/manifest";
import { characterAnchorPrompt } from "@/lib/story/prompt/characterAnchor";
import { getPrintProfile } from "@/lib/print/registry";
import { resolveLayoutPlan } from "@/lib/story/layoutPlan";
import { customSpreadsSchema, firstZodIssueMessage } from "@/lib/story/customSpreadsSchema";
import { lintPromptContract, lintSubmittedSpreadsMatchResolved } from "@/lib/story/promptContractLint";
import type { ChildProfile } from "@/lib/story/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  age: z.coerce.number().int().min(0).max(18),
  gender: z.enum(["boy", "girl", "neutral"]),
});

function errorResponse(status: number, message: string, code: string, requestId: string) {
  return NextResponse.json({ error: message, code, requestId }, { status });
}

/**
 * True for the plain `throw new Error(...)` validation failures this route's
 * dependencies raise deliberately (invalid layout/edition/facing-pair
 * requests) — safe to show verbatim. False for TypeError/ReferenceError/etc,
 * which indicate a real bug rather than a rejected request.
 */
function isControlledValidationError(err: unknown): err is Error {
  return err instanceof Error && err.constructor === Error;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Expected JSON body.", "INVALID_JSON_BODY", requestId);
    }

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input.",
        "INVALID_PROFILE",
        requestId,
      );
    }

    const child: ChildProfile = parsed.data;
    const rawBody = body as {
      bookId?: unknown;
      profileId?: unknown;
      mode?: unknown;
      customSpreads?: unknown;
    };

    const bookId = typeof rawBody.bookId === "string" ? rawBody.bookId : undefined;
    const profileId = typeof rawBody.profileId === "string" ? rawBody.profileId : undefined;
    const mode =
      rawBody.mode === "custom-spreads" || rawBody.mode === "standard-single"
        ? rawBody.mode
        : undefined;

    const spreadsParsed = customSpreadsSchema.safeParse(rawBody.customSpreads ?? []);
    if (!spreadsParsed.success) {
      return errorResponse(
        400,
        firstZodIssueMessage(spreadsParsed.error),
        "INVALID_CUSTOM_SPREADS",
        requestId,
      );
    }
    const customSpreads = spreadsParsed.data;

    try {
      const profile = getPrintProfile(profileId);
      const plan = resolveLayoutPlan({
        child,
        bookId: bookId ?? "dream-big",
        profileId: profile.id,
        mode,
        customSpreads,
      });
      const resolvedSlots = plan.assets.map((slot) => ({
        slotId: slot.slotId,
        illustrationIndex: slot.illustrationIndex,
        pageKind: slot.pageKind,
        assetKind: slot.assetKind,
        profileId: slot.profileId,
        layout: slot.layout,
        filename: slot.filename ?? slot.expectedFilename,
        expectedFilename: slot.expectedFilename ?? slot.filename,
        legacyAliases: slot.legacyAliases,
        role: slot.role ?? slot.sourceSceneRole,
        roleSlug: slot.roleSlug,
        required: slot.required,
        physicalPages: slot.physicalPages,
        destinationDimensions: slot.destinationDimensions,
        expectedSourceAspect: slot.expectedSourceAspect,
        textSide: slot.textSide,
        subjectSide: slot.subjectSide,
      }));

      const pages = buildManifest(child, bookId, profileId, mode, customSpreads);
      const markdown = renderPromptsMarkdown(child, bookId, profileId, mode, customSpreads);
      const anchorPrompt = characterAnchorPrompt(child);

      // Fail closed rather than hand back self-contradictory prompts: these
      // checks catch the exact defect classes a live run previously found
      // (front-cover text leaking into the backcover, single/spread
      // composition mismatches, aspect-heading-vs-prompt-body contradictions,
      // wardrobe contradictions, filename/physical-page mismatches, and a
      // submitted spread silently vanishing or an unsubmitted one appearing).
      const contractLint = lintPromptContract(pages);
      const spreadLint = lintSubmittedSpreadsMatchResolved(customSpreads, pages);
      const lintIssues = [...contractLint.issues, ...spreadLint.issues];
      if (lintIssues.length > 0) {
        console.error(`[api/prompts] requestId=${requestId} prompt contract violation`, lintIssues);
        return errorResponse(
          500,
          "The generated prompts failed an internal consistency check and were not returned.",
          "PROMPT_CONTRACT_VIOLATION",
          requestId,
        );
      }

      return NextResponse.json({ pages, markdown, anchorPrompt, resolvedSlots });
    } catch (err) {
      if (isControlledValidationError(err)) {
        return errorResponse(400, err.message, "INVALID_LAYOUT", requestId);
      }
      console.error(`[api/prompts] requestId=${requestId} unexpected error`, err);
      return errorResponse(
        500,
        "An unexpected error occurred while generating prompts.",
        "PROMPTS_INTERNAL_ERROR",
        requestId,
      );
    }
  } catch (err) {
    // Last-resort net: whatever went wrong, respond with sanitized JSON —
    // never let the default Next.js HTML error page reach the client.
    console.error(`[api/prompts] requestId=${requestId} unhandled error`, err);
    return errorResponse(500, "An unexpected server error occurred.", "PROMPTS_INTERNAL_ERROR", requestId);
  }
}

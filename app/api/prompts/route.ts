/**
 * POST /api/prompts
 *
 * Free path: returns the 24 personalized prompts (with filenames + page text)
 * and a ready-to-save prompts.md for a child. No Gemini API call — you generate
 * the images yourself in the Gemini app.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildManifest, renderPromptsMarkdown } from "@/lib/manual/manifest";
import { characterAnchorPrompt } from "@/lib/story/prompt/characterAnchor";
import type { ChildProfile } from "@/lib/story/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  age: z.coerce.number().int().min(0).max(18),
  gender: z.enum(["boy", "girl", "neutral"]),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
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
  const customSpreads = Array.isArray(rawBody.customSpreads)
    ? (rawBody.customSpreads as any)
    : undefined;

  const pages = buildManifest(child, bookId, profileId, mode, customSpreads);
  const markdown = renderPromptsMarkdown(child, bookId, profileId, mode, customSpreads);
  const anchorPrompt = characterAnchorPrompt(child);

  return NextResponse.json({ pages, markdown, anchorPrompt });
}

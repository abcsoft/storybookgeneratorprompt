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
  const bookId =
    typeof (body as { bookId?: unknown }).bookId === "string"
      ? (body as { bookId: string }).bookId
      : undefined;
  const profileId =
    typeof (body as { profileId?: unknown }).profileId === "string"
      ? (body as { profileId: string }).profileId
      : undefined;

  const pages = buildManifest(child, bookId, profileId);
  const markdown = renderPromptsMarkdown(child, bookId, profileId);
  const anchorPrompt = characterAnchorPrompt(child);

  return NextResponse.json({ pages, markdown, anchorPrompt });
}

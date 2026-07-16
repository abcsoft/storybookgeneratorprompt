/**
 * POST /api/generate
 *
 * Accepts the upload form (photos + name/age/gender), validates it, preprocesses
 * the photos, creates a job, and kicks off generation in the background. Returns
 * the jobId immediately so the client can poll for progress.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runGenerationJob } from "@/lib/generate/orchestrator";
import { createJob } from "@/lib/generate/jobStore";
import { preparePhotos } from "@/lib/images/preprocess";
import { getBook } from "@/lib/story/registry";
import type { ChildProfile } from "@/lib/story/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  age: z.coerce.number().int().min(0).max(18),
  gender: z.enum(["boy", "girl", "neutral"]),
});

export async function POST(request: Request): Promise<Response> {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Server is not configured: GEMINI_API_KEY is missing. Add it to " +
          ".env.local and restart the dev server.",
      },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const parsed = profileSchema.safeParse({
    name: form.get("name"),
    age: form.get("age"),
    gender: form.get("gender"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const child: ChildProfile = parsed.data;

  const files = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Please upload at least one photo." },
      { status: 400 },
    );
  }

  let photos;
  try {
    const buffers = await Promise.all(
      files.map(async (f) => Buffer.from(await f.arrayBuffer())),
    );
    photos = await preparePhotos(buffers);
  } catch {
    return NextResponse.json(
      { error: "Could not read one of the photos. Please try different images." },
      { status: 400 },
    );
  }

  const book = getBook((form.get("bookId") as string) || undefined);
  const job = createJob(child.name, book.id, book.pages.length);

  // Fire-and-forget: generation runs in the background; the client polls status.
  void runGenerationJob(job.id, child, photos, book.id).catch(() => {
    /* runGenerationJob records its own errors on the job */
  });

  return NextResponse.json({ jobId: job.id, total: job.total });
}

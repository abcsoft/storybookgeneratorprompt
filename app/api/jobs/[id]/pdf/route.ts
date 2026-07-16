/**
 * GET /api/jobs/[id]/pdf
 *
 * Streams the finished print-ready PDF for download once the job is complete.
 */

import { NextResponse } from "next/server";
import { getJob } from "@/lib/generate/jobStore";
import { bookFilename } from "@/lib/story/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "done" || !job.pdf) {
    return NextResponse.json(
      { error: "The book is not ready yet." },
      { status: 409 },
    );
  }

  return new Response(new Uint8Array(job.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${bookFilename(job.childName, job.bookId)}"`,
      "Content-Length": String(job.pdf.length),
    },
  });
}

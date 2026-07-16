/**
 * GET /api/jobs/[id]
 *
 * Returns the current status and progress of a generation job so the client can
 * render a progress bar and know when the PDF is ready to download.
 */

import { NextResponse } from "next/server";
import { getJob } from "@/lib/generate/jobStore";

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

  return NextResponse.json({
    id: job.id,
    status: job.status,
    completed: job.completed,
    total: job.total,
    failedPages: job.failedPages,
    error: job.error,
    pdfReady: job.status === "done" && !!job.pdf,
  });
}

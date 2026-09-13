import { NextResponse } from "next/server";
import { getActiveVisionProvider, validateStoryMatch } from "@/lib/semantic/semanticValidator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;

export async function GET(): Promise<Response> {
  const provider = getActiveVisionProvider();
  if (!provider) {
    return NextResponse.json({
      provider: null,
      isAvailable: false,
      message: "No vision provider configured. Only preliminary metadata diagnostic scanning available.",
    });
  }

  return NextResponse.json({
    provider: {
      id: provider.id,
      name: provider.name,
      isConfigured: provider.isConfigured,
      isPaid: provider.isPaid,
      analysisMethod: provider.analysisMethod,
    },
    isAvailable: true,
    costEstimate: provider.estimateCost(1),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided for semantic check." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds maximum upload limit of ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.` },
        { status: 413 },
      );
    }

    const mimeType = file.type || "image/png";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported image MIME type "${mimeType}". Allowed: image/png, image/jpeg, image/webp.` },
        { status: 400 },
      );
    }

    const slotId = (formData.get("slotId") as string) || "slot";
    const roleSlug = (formData.get("roleSlug") as string) || "scene";
    const expectedRole = (formData.get("expectedRole") as string) || roleSlug;
    const storyText = (formData.get("storyText") as string) || "";
    const prompt = (formData.get("prompt") as string) || "";
    const userConfirmedPaid = formData.get("userConfirmedPaid") === "true";

    const visionProvider = getActiveVisionProvider();
    if (visionProvider && visionProvider.isPaid && !userConfirmedPaid) {
      return NextResponse.json(
        {
          error: "Explicit user confirmation required before making paid vision API calls.",
          requiresConfirmation: true,
          providerId: visionProvider.id,
          costEstimate: visionProvider.estimateCost(1),
        },
        { status: 402 },
      );
    }

    let otherSlots: any[] = [];
    const otherSlotsRaw = formData.get("otherSlots") as string | null;
    if (otherSlotsRaw) {
      try {
        otherSlots = JSON.parse(otherSlotsRaw);
      } catch {
        /* ignore invalid JSON */
      }
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());

    const result = await validateStoryMatch({
      slotId,
      filename: file.name,
      expectedRole,
      roleSlug,
      storyText,
      prompt,
      imageBuffer,
      mimeType,
      otherSlots,
      userConfirmedPaid,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "CHECK_FAILED",
        error: err.message ?? "Semantic check failed.",
        explanation: `Semantic analysis could not complete: ${err.message ?? String(err)}`,
      },
      { status: 500 },
    );
  }
}

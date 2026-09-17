import { NextResponse } from "next/server";
import { getActiveVisionProviderAsync, validateStoryMatch } from "@/lib/semantic/semanticValidator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;

/** Provider-capabilities / health endpoint — GET /api/semantic-check.
 *  Reports whether "Check story match" can do a REAL visual check right
 *  now, including a live (read-only, never-downloads) Ollama probe. */
export async function GET(): Promise<Response> {
  const { provider, ollamaProbe } = await getActiveVisionProviderAsync();
  if (!provider) {
    return NextResponse.json({
      provider: null,
      isAvailable: false,
      message: "No vision provider configured. Story visual match cannot be checked — only preliminary metadata diagnostic scanning is available.",
      ollama: ollamaProbe
        ? { available: ollamaProbe.available, reason: ollamaProbe.reason, setupInstructions: ollamaProbe.setupInstructions }
        : undefined,
      setupInstructions:
        ollamaProbe?.setupInstructions ??
        "Configure a vision provider: run a local Ollama vision model (see OLLAMA_BASE_URL/OLLAMA_VISION_MODEL), " +
          "or set VISION_API_URL + VISION_API_KEY for an OpenAI-compatible cloud endpoint.",
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
    ollama: ollamaProbe ? { available: ollamaProbe.available, model: ollamaProbe.model } : undefined,
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

    const { provider: visionProvider, ollamaProbe } = await getActiveVisionProviderAsync();
    if (!visionProvider) {
      // Never a misleading 200 "NOT_CHECKED" — a real story-match check was
      // requested and none is possible right now. Fail closed with the
      // exact setup instructions instead of silently degrading.
      return NextResponse.json(
        {
          code: "VISION_PROVIDER_UNAVAILABLE",
          status: "CHECK_FAILED",
          error: "No AI vision provider is available. Story visual match cannot be checked.",
          ollama: ollamaProbe
            ? { available: ollamaProbe.available, reason: ollamaProbe.reason, setupInstructions: ollamaProbe.setupInstructions }
            : undefined,
          setupInstructions:
            ollamaProbe?.setupInstructions ??
            "Configure a vision provider: run a local Ollama vision model (see OLLAMA_BASE_URL/OLLAMA_VISION_MODEL), " +
              "or set VISION_API_URL + VISION_API_KEY for an OpenAI-compatible cloud endpoint.",
        },
        { status: 503 },
      );
    }
    if (visionProvider.isPaid && !userConfirmedPaid) {
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

    const parseJsonArrayField = (name: string): string[] | undefined => {
      const raw = formData.get(name) as string | null;
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : undefined;
      } catch {
        return undefined;
      }
    };

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
      visionProvider, // already resolved above — avoid a second Ollama probe
      requiredCharacters: parseJsonArrayField("requiredCharacters"),
      requiredAction: (formData.get("requiredAction") as string) || undefined,
      requiredLocation: (formData.get("requiredLocation") as string) || undefined,
      requiredProps: parseJsonArrayField("requiredProps"),
      continuityContract: parseJsonArrayField("continuityContract"),
      forbiddenSubstitutions: parseJsonArrayField("forbiddenSubstitutions"),
      identityStyleFingerprint: (formData.get("identityStyleFingerprint") as string) || undefined,
      secretMarkerFingerprint: (formData.get("secretMarkerFingerprint") as string) || undefined,
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

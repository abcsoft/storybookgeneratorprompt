import { NextResponse } from "next/server";
import sharp from "sharp";
import { enhancementRegistry } from "@/lib/enhance/registry";
import type { EnhanceImageOptions } from "@/lib/enhance/types";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const count = Number(url.searchParams.get("count") ?? "1");
  const providerId = url.searchParams.get("provider");

  const provider = enhancementRegistry.getActiveProvider(providerId ?? undefined);
  const costEstimate = provider.estimateCost(count);

  return NextResponse.json({
    provider: {
      id: provider.id,
      name: provider.name,
      isConfigured: provider.isConfigured,
      isPaid: provider.isPaid,
    },
    costEstimate,
    availableProviders: enhancementRegistry.listProviders().map((p) => ({
      id: p.id,
      name: p.name,
      isConfigured: p.isConfigured,
      isPaid: p.isPaid,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    const method = (formData.get("method") as string) || "mocked-ai-super-res";
    const userConfirmedPaid = formData.get("userConfirmedPaid") === "true";
    const targetWidth = Number(formData.get("targetWidth") ?? "3375");
    const targetHeight = Number(formData.get("targetHeight") ?? "2475");
    const physicalWidthIn = Number(formData.get("physicalWidthIn") ?? "11.25");
    const physicalHeightIn = Number(formData.get("physicalHeightIn") ?? "8.25");
    const slotId = (formData.get("slotId") as string) || "slot";

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(inputBuffer).metadata();
    const sourceWidth = meta.width ?? targetWidth;
    const sourceHeight = meta.height ?? targetHeight;

    const provider = enhancementRegistry.getActiveProvider(method);

    if (provider.isPaid && !userConfirmedPaid) {
      return NextResponse.json(
        {
          error: "Explicit user confirmation required before making paid AI enhancement API calls.",
          requiresConfirmation: true,
          estimate: provider.estimateCost(1),
        },
        { status: 402 },
      );
    }

    const options: EnhanceImageOptions = {
      inputBuffer,
      mimeType: file.type || "image/png",
      filename: file.name,
      sourceDimensions: { width: sourceWidth, height: sourceHeight },
      targetDimensions: { width: targetWidth, height: targetHeight },
      physicalInches: { width: physicalWidthIn, height: physicalHeightIn },
      method: provider.id as any,
      userConfirmedPaid,
    };

    const result = await provider.enhanceImage(options);

    return NextResponse.json({
      slotId,
      filename: file.name,
      outputDimensions: result.outputDimensions,
      method: result.method,
      upscaleFactor: result.upscaleFactor,
      provenance: result.provenance,
      mimeType: result.mimeType,
      enhancedBase64: `data:${result.mimeType};base64,${result.enhancedBuffer.toString("base64")}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Resolution enhancement failed." },
      { status: 500 },
    );
  }
}

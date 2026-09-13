import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp, { type Metadata } from "sharp";
import { enhancementRegistry } from "@/lib/enhance/registry";
import { signEnhancementReceipt } from "@/lib/enhance/receipt";
import { computeAuthoritativePhysicalDimensionsIn, computeEffectivePpi } from "@/lib/enhance/provenance";
import { resolveLayoutPlan, type LayoutMode } from "@/lib/story/layoutPlan";
import { getPrintProfile } from "@/lib/print/registry";
import { DEFAULT_BOOK_ID } from "@/lib/story/registry";
import type { EnhanceImageOptions } from "@/lib/enhance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024; // 35 MB
const MAX_PIXEL_COUNT = 50_000_000; // 50 Megapixels

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const count = Math.max(1, Number(url.searchParams.get("count") ?? "1"));
  const providerId = url.searchParams.get("provider");

  const provider = enhancementRegistry.getActiveProvider(providerId ?? undefined);

  if (!provider) {
    return NextResponse.json({
      provider: null,
      isAvailable: false,
      message: "No AI resolution enhancement provider configured. Replace or regenerate image.",
      availableProviders: enhancementRegistry.listProviders().map((p) => ({
        id: p.id,
        name: p.name,
        providerClass: p.providerClass,
        isConfigured: p.isConfigured,
        available: p.isConfigured,
        isPaid: p.isPaid,
      })),
    });
  }

  const costEstimate = provider.estimateCost(count);

  return NextResponse.json({
    provider: {
      id: provider.id,
      name: provider.name,
      providerClass: provider.providerClass,
      isConfigured: provider.isConfigured,
      available: provider.isConfigured,
      isPaid: provider.isPaid,
    },
    isAvailable: true,
    costEstimate,
    availableProviders: enhancementRegistry.listProviders().map((p) => ({
      id: p.id,
      name: p.name,
      providerClass: p.providerClass,
      isConfigured: p.isConfigured,
      available: p.isConfigured,
      isPaid: p.isPaid,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Malformed multipart form data." }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
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

    // ─────────────────────────────────────────────────────────────
    // 1. Authoritative Identity Resolution
    // Server derives slot and dimensions — client-supplied targetWidth/Height ignored!
    // ─────────────────────────────────────────────────────────────
    const bookId = (formData.get("bookId") as string) || DEFAULT_BOOK_ID;
    const profileId = (formData.get("profileId") as string) || "classic-landscape-11x8";
    const rawMode = (formData.get("layoutMode") as string) || (formData.get("mode") as string) || "standard-single";
    const layoutMode: LayoutMode = rawMode === "custom-spreads" ? "custom-spreads" : "standard-single";
    const slotId = (formData.get("slotId") as string) || "";
    const requestedProviderId = (formData.get("providerId") as string) || (formData.get("method") as string) || undefined;
    const userConfirmedPaid = formData.get("userConfirmedPaid") === "true";

    let customSpreads: any = undefined;
    const rawSpreads = formData.get("customSpreads");
    if (typeof rawSpreads === "string") {
      try {
        customSpreads = JSON.parse(rawSpreads);
      } catch {
        /* ignore invalid json */
      }
    }

    const profile = getPrintProfile(profileId);
    const plan = resolveLayoutPlan({
      child: { name: "Child", age: 4, gender: "neutral" },
      bookId,
      profileId: profile.id,
      mode: layoutMode,
      customSpreads,
    });

    const slot = plan.assets.find((s) => s.slotId === slotId);
    if (!slot) {
      return NextResponse.json(
        { error: `Unknown slot ID "${slotId}" for book "${bookId}" and profile "${profileId}".` },
        { status: 400 },
      );
    }

    // Authoritative target dimensions and physical placement derived from profile and slot
    const targetWidth = slot.destinationDimensions.width;
    const targetHeight = slot.destinationDimensions.height;
    const physicalDimensions = computeAuthoritativePhysicalDimensionsIn(
      slot.destinationDimensions,
      profile.dpi,
    );

    // ─────────────────────────────────────────────────────────────
    // 2. Image Decoding & Decompression Bomb Guard
    // ─────────────────────────────────────────────────────────────
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    let meta: Metadata;
    try {
      meta = await sharp(inputBuffer).metadata();
    } catch {
      return NextResponse.json({ error: "Uploaded file is corrupt or undecodable as an image." }, { status: 400 });
    }

    const sourceWidth = meta.width ?? 0;
    const sourceHeight = meta.height ?? 0;

    if (sourceWidth === 0 || sourceHeight === 0) {
      return NextResponse.json({ error: "Unable to read image pixel dimensions." }, { status: 400 });
    }

    if (sourceWidth * sourceHeight > MAX_PIXEL_COUNT) {
      return NextResponse.json(
        { error: "Image pixel dimensions exceed maximum allowable limit (decompression bomb guard)." },
        { status: 400 },
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Provider Resolution & Paid Confirmation Check
    // ─────────────────────────────────────────────────────────────
    const provider = enhancementRegistry.getActiveProvider(requestedProviderId);
    if (!provider) {
      return NextResponse.json(
        {
          error:
            "No AI resolution enhancement provider is configured or available. " +
            "Please provide a higher-resolution image or use Replace / Regenerate image.",
          code: "PROVIDER_UNAVAILABLE",
        },
        { status: 400 },
      );
    }

    if (provider.isPaid && !userConfirmedPaid) {
      return NextResponse.json(
        {
          error: "Explicit user confirmation required before making paid AI enhancement API calls.",
          requiresConfirmation: true,
          providerId: provider.id,
          providerName: provider.name,
          costEstimate: provider.estimateCost(1),
        },
        { status: 402 },
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Execute Enhancement
    // ─────────────────────────────────────────────────────────────
    const options: EnhanceImageOptions = {
      inputBuffer,
      mimeType,
      filename: file.name,
      slotId: slot.slotId,
      profileId: profile.id,
      layoutMode,
      sourceDimensions: { width: sourceWidth, height: sourceHeight },
      targetDimensions: { width: targetWidth, height: targetHeight },
      physicalInches: physicalDimensions,
      method: provider.id as any,
      userConfirmedPaid,
    };

    const result = await provider.enhanceImage(options);

    // Validate enhanced output dimensions strictly match destination
    if (
      result.outputDimensions.width !== targetWidth ||
      result.outputDimensions.height !== targetHeight
    ) {
      return NextResponse.json(
        {
          error: `Enhanced asset dimensions ${result.outputDimensions.width}×${result.outputDimensions.height} do not match authoritative destination canvas ${targetWidth}×${targetHeight}.`,
        },
        { status: 500 },
      );
    }

    const nativeEffectivePpi = computeEffectivePpi(
      { width: sourceWidth, height: sourceHeight },
      physicalDimensions,
    );

    // ─────────────────────────────────────────────────────────────
    // 5. Issue Server-Signed Enhancement Receipt
    // ─────────────────────────────────────────────────────────────
    const signedReceipt = signEnhancementReceipt({
      receiptId: randomUUID(),
      slotId: slot.slotId,
      bookId,
      profileId: profile.id,
      layoutMode,
      originalSha256: result.provenance.originalSha256,
      originalPixelDimensions: { width: sourceWidth, height: sourceHeight },
      enhancedSha256: result.provenance.enhancedSha256 || "",
      enhancedPixelDimensions: { width: targetWidth, height: targetHeight },
      destinationDimensions: { width: targetWidth, height: targetHeight },
      trustedProviderId: provider.id,
      providerClass: provider.providerClass,
      nativeEffectivePpi,
      enhancedEffectivePpi: result.provenance.enhancedEffectivePpi ?? nativeEffectivePpi,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const enrichedProvenance = {
      ...result.provenance,
      providerClass: provider.providerClass,
      receipt: signedReceipt,
    };

    return NextResponse.json({
      slotId: slot.slotId,
      filename: file.name,
      outputDimensions: result.outputDimensions,
      method: result.method,
      providerClass: provider.providerClass,
      upscaleFactor: result.upscaleFactor,
      provenance: enrichedProvenance,
      receipt: signedReceipt,
      mimeType: result.mimeType,
      costEstimate: provider.estimateCost(1),
      enhancedBase64: `data:${result.mimeType};base64,${result.enhancedBuffer.toString("base64")}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Resolution enhancement failed." },
      { status: 500 },
    );
  }
}

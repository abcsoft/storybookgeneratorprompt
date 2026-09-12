import type { PrintProfile, PxSize } from "./types";

export interface ArtworkTransform {
  mode: "fit" | "fill" | "manual";
  scale: number;
  offsetX: number;
  offsetY: number;
  backgroundMode: "extended" | "none";
}

export const DEFAULT_ARTWORK_TRANSFORM: ArtworkTransform = {
  mode: "fit",
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  backgroundMode: "extended",
};

export interface LayoutDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  aspectCss: string;
}

/**
 * Calculates exact physical target canvas dimensions and aspect ratio
 * for single pages vs two-page spreads based on the active PrintProfile.
 */
export function getLayoutDimensions(
  profile: PrintProfile,
  pageLayout: "single" | "spread",
): LayoutDimensions {
  const isSpread = pageLayout === "spread";
  const width = isSpread ? profile.canvasPx.width * 2 : profile.canvasPx.width;
  const height = profile.canvasPx.height;
  const aspectRatio = width / height;
  const aspectCss = `${width} / ${height}`;

  return { width, height, aspectRatio, aspectCss };
}

export interface ArtworkRenderInput {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  layout: "single" | "spread";
  transform?: ArtworkTransform;
}

export interface NormalizedRenderGeometry {
  renderedWidth: number;
  renderedHeight: number;
  translateX: number;
  translateY: number;
  scale: number;
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  cropBounds: { left: number; top: number; width: number; height: number };
  showBackdrop: boolean;
  backgroundMode: "extended" | "none";
  extensionStrategy: "fill" | "fit" | "extended";
}

export interface TransformGeometry {
  /** Effective scale factor relative to natural size. */
  effectiveScale: number;
  /** Subject width in destination pixels. */
  width: number;
  /** Subject height in destination pixels. */
  height: number;
  /** Top-left X offset in destination pixels relative to container top-left. */
  left: number;
  /** Top-left Y offset in destination pixels relative to container top-left. */
  top: number;
  /** Destination container width in pixels. */
  destWidth: number;
  /** Destination container height in pixels. */
  destHeight: number;
  /** Whether backdrop extension should be shown. */
  showBackdrop: boolean;
  /** Explicit strategy determined for artwork extension. */
  extensionStrategy: "fill" | "fit" | "extended";
}

/**
 * Single authoritative mathematical renderer for resolving normalized artwork positioning,
 * scaling, offsets, percentage geometry, crop bounds, and backdrop rules.
 */
export function resolveArtworkRender(input: ArtworkRenderInput): NormalizedRenderGeometry {
  const t = sanitizeTransform(input.transform);
  const sourcePx: PxSize = {
    width: Math.max(1, input.sourceWidth || (input.layout === "spread" ? 2000 : 1000)),
    height: Math.max(1, input.sourceHeight || 1000),
  };
  const destPx: PxSize = {
    width: Math.max(1, input.targetWidth),
    height: Math.max(1, input.targetHeight),
  };

  const geo = computeTransformGeometry(sourcePx, destPx, t);
  const pct = computePercentGeometry(geo);

  const srcCropLeft = Math.max(0, -geo.left);
  const srcCropTop = Math.max(0, -geo.top);
  const srcCropWidth = Math.min(geo.width - srcCropLeft, destPx.width - Math.max(0, geo.left));
  const srcCropHeight = Math.min(geo.height - srcCropTop, destPx.height - Math.max(0, geo.top));

  return {
    renderedWidth: geo.width,
    renderedHeight: geo.height,
    translateX: geo.left,
    translateY: geo.top,
    scale: geo.effectiveScale,
    leftPx: geo.left,
    topPx: geo.top,
    widthPx: geo.width,
    heightPx: geo.height,
    leftPct: pct.leftPct,
    topPct: pct.topPct,
    widthPct: pct.widthPct,
    heightPct: pct.heightPct,
    cropBounds: {
      left: srcCropLeft,
      top: srcCropTop,
      width: Math.max(1, srcCropWidth),
      height: Math.max(1, srcCropHeight),
    },
    showBackdrop: geo.showBackdrop,
    backgroundMode: t.backgroundMode,
    extensionStrategy: geo.extensionStrategy,
  };
}

/**
 * Calculates exact positioning and dimensions for placing source artwork
 * into a destination rectangle (single page or wide spread master).
 */
export function computeTransformGeometry(
  sourcePx: PxSize,
  destPx: PxSize,
  transform: ArtworkTransform = DEFAULT_ARTWORK_TRANSFORM,
): TransformGeometry {
  const safeSourceW = Math.max(1, sourcePx.width);
  const safeSourceH = Math.max(1, sourcePx.height);
  const safeDestW = Math.max(1, destPx.width);
  const safeDestH = Math.max(1, destPx.height);

  const fitScale = Math.min(safeDestW / safeSourceW, safeDestH / safeSourceH);
  const fillScale = Math.max(safeDestW / safeSourceW, safeDestH / safeSourceH);

  let isAutoFillPromoted = false;
  let baseScale = fitScale;
  if (transform.mode === "fill") {
    baseScale = fillScale;
  } else if (
    transform.mode === "fit" &&
    transform.backgroundMode === "extended" &&
    transform.scale === 1.0 &&
    transform.offsetX === 0 &&
    transform.offsetY === 0 &&
    fillScale / fitScale <= 1.18
  ) {
    // Near-aspect match (e.g. 16:9 source on 2:1 spread target): safely fill target to avoid unnecessary side bands
    baseScale = fillScale;
    isAutoFillPromoted = true;
  }

  const effectiveScale = baseScale * (transform.scale || 1.0);
  const width = Math.round(safeSourceW * effectiveScale);
  const height = Math.round(safeSourceH * effectiveScale);

  // Center alignment + normalized offset relative to destination dimensions
  const left = Math.round((safeDestW - width) / 2 + (transform.offsetX || 0) * safeDestW);
  const top = Math.round((safeDestH - height) / 2 + (transform.offsetY || 0) * safeDestH);

  const showBackdrop =
    transform.backgroundMode === "extended" && (width < safeDestW || height < safeDestH);

  let extensionStrategy: "fill" | "fit" | "extended" = "fit";
  if (transform.mode === "fill" || isAutoFillPromoted || (width >= safeDestW && height >= safeDestH)) {
    extensionStrategy = "fill";
  } else if (showBackdrop) {
    extensionStrategy = "extended";
  }

  return {
    effectiveScale,
    width,
    height,
    left,
    top,
    destWidth: safeDestW,
    destHeight: safeDestH,
    showBackdrop,
    extensionStrategy,
  };
}

/**
 * Normalizes an ArtworkTransform object, enforcing valid bounds.
 */
export function sanitizeTransform(input?: Partial<ArtworkTransform> | null): ArtworkTransform {
  if (!input) return { ...DEFAULT_ARTWORK_TRANSFORM };
  const mode = input.mode === "fill" || input.mode === "manual" ? input.mode : "fit";
  const scale = typeof input.scale === "number" && !isNaN(input.scale)
    ? Math.max(0.1, Math.min(5.0, input.scale))
    : 1.0;
  const offsetX = typeof input.offsetX === "number" && !isNaN(input.offsetX)
    ? Math.max(-2.0, Math.min(2.0, input.offsetX))
    : 0;
  const offsetY = typeof input.offsetY === "number" && !isNaN(input.offsetY)
    ? Math.max(-2.0, Math.min(2.0, input.offsetY))
    : 0;
  const backgroundMode = input.backgroundMode === "none" ? "none" : "extended";

  return { mode, scale, offsetX, offsetY, backgroundMode };
}

/**
 * Returns CSS position and size styles (in percentages) for responsive preview elements.
 */
export function computePercentGeometry(geo: TransformGeometry): {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
} {
  return {
    leftPct: (geo.left / geo.destWidth) * 100,
    topPct: (geo.top / geo.destHeight) * 100,
    widthPct: (geo.width / geo.destWidth) * 100,
    heightPct: (geo.height / geo.destHeight) * 100,
  };
}

export type CornerHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function calculateCornerResize(
  initialScale: number,
  initialWidthPx: number,
  initialHeightPx: number,
  deltaXPx: number,
  deltaYPx: number,
  corner: CornerHandle,
): number {
  const currentW = Math.max(1, initialWidthPx);
  const currentH = Math.max(1, initialHeightPx);

  let scaleFactor = 1.0;
  if (corner === "bottom-right") {
    const factorX = (currentW + deltaXPx) / currentW;
    const factorY = (currentH + deltaYPx) / currentH;
    scaleFactor = Math.abs(deltaXPx) > Math.abs(deltaYPx) ? factorX : factorY;
  } else if (corner === "bottom-left") {
    const factorX = (currentW - deltaXPx) / currentW;
    const factorY = (currentH + deltaYPx) / currentH;
    scaleFactor = Math.abs(deltaXPx) > Math.abs(deltaYPx) ? factorX : factorY;
  } else if (corner === "top-right") {
    const factorX = (currentW + deltaXPx) / currentW;
    const factorY = (currentH - deltaYPx) / currentH;
    scaleFactor = Math.abs(deltaXPx) > Math.abs(deltaYPx) ? factorX : factorY;
  } else if (corner === "top-left") {
    const factorX = (currentW - deltaXPx) / currentW;
    const factorY = (currentH - deltaYPx) / currentH;
    scaleFactor = Math.abs(deltaXPx) > Math.abs(deltaYPx) ? factorX : factorY;
  }

  const nextScale = Math.max(0.1, Math.min(5.0, initialScale * scaleFactor));
  return Number(nextScale.toFixed(3));
}

export interface NormalizationTransformTelemetry {
  rawProviderDimensions: { width: number; height: number };
  uniformScaleFactor: number;
  scaledDimensions: { width: number; height: number };
  cropRectangle: { left: number; top: number; width: number; height: number };
  pixelsRemoved: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    totalVertical: number;
    totalHorizontal: number;
  };
  targetDimensions: { width: number; height: number };
  strategyUsed: "exact-match" | "proportional-cover-crop" | "proportional-contain-backdrop";
  cropLossPct: {
    verticalPct: number;
    horizontalPct: number;
  };
  transformationUsed: "none" | "crop" | "contain-backdrop";
}

export interface NormalizationResult {
  data: Buffer;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  uniformScale: number;
  cropBounds: { left: number; top: number; width: number; height: number };
  strategy: "exact-match" | "proportional-cover-crop" | "proportional-contain-backdrop";
  telemetry: NormalizationTransformTelemetry;
}

/**
 * Calculates deterministic normalization transform parameters and telemetry
 * without mutating image buffers.
 */
export function calculateNormalizationTransform(
  rawDimensions: { width: number; height: number },
  targetDimensions: { width: number; height: number },
  strategy: "proportional-cover-crop" | "proportional-contain-backdrop" | "exact-match" = "proportional-cover-crop",
): NormalizationTransformTelemetry {
  const srcW = Math.max(1, rawDimensions.width);
  const srcH = Math.max(1, rawDimensions.height);

  if (srcW === targetDimensions.width && srcH === targetDimensions.height) {
    return {
      rawProviderDimensions: { width: srcW, height: srcH },
      uniformScaleFactor: 1.0,
      scaledDimensions: { width: srcW, height: srcH },
      cropRectangle: { left: 0, top: 0, width: targetDimensions.width, height: targetDimensions.height },
      pixelsRemoved: { top: 0, bottom: 0, left: 0, right: 0, totalVertical: 0, totalHorizontal: 0 },
      targetDimensions,
      strategyUsed: "exact-match",
      transformationUsed: "none",
      cropLossPct: { verticalPct: 0, horizontalPct: 0 },
    };
  }

  if (strategy === "proportional-cover-crop" || strategy === "exact-match") {
    const scale = Math.max(targetDimensions.width / srcW, targetDimensions.height / srcH);
    const scaledW = Math.round(srcW * scale);
    const scaledH = Math.round(srcH * scale);

    const totalExcessW = Math.max(0, scaledW - targetDimensions.width);
    const totalExcessH = Math.max(0, scaledH - targetDimensions.height);

    const cropLeft = Math.floor(totalExcessW / 2);
    const cropRight = totalExcessW - cropLeft;
    const cropTop = Math.floor(totalExcessH / 2);
    const cropBottom = totalExcessH - cropTop;

    return {
      rawProviderDimensions: { width: srcW, height: srcH },
      uniformScaleFactor: scale,
      scaledDimensions: { width: scaledW, height: scaledH },
      cropRectangle: { left: cropLeft, top: cropTop, width: targetDimensions.width, height: targetDimensions.height },
      pixelsRemoved: {
        top: cropTop,
        bottom: cropBottom,
        left: cropLeft,
        right: cropRight,
        totalVertical: totalExcessH,
        totalHorizontal: totalExcessW,
      },
      targetDimensions,
      strategyUsed: "proportional-cover-crop",
      transformationUsed: "crop",
      cropLossPct: {
        verticalPct: Number(((totalExcessH / scaledH) * 100).toFixed(2)),
        horizontalPct: Number(((totalExcessW / scaledW) * 100).toFixed(2)),
      },
    };
  }

  // Contain + backdrop
  const scale = Math.min(targetDimensions.width / srcW, targetDimensions.height / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);

  return {
    rawProviderDimensions: { width: srcW, height: srcH },
    uniformScaleFactor: scale,
    scaledDimensions: { width: scaledW, height: scaledH },
    cropRectangle: { left: 0, top: 0, width: scaledW, height: scaledH },
    pixelsRemoved: { top: 0, bottom: 0, left: 0, right: 0, totalVertical: 0, totalHorizontal: 0 },
    targetDimensions,
    strategyUsed: "proportional-contain-backdrop",
    transformationUsed: "contain-backdrop",
    cropLossPct: { verticalPct: 0, horizontalPct: 0 },
  };
}

/**
 * Normalizes raw provider output into exact production asset dimensions
 * using deterministic, strictly proportional scaling (asserting scaleX === scaleY).
 * Never performs independent X/Y stretching.
 */
export async function normalizeProductionAsset(
  inputBuffer: Buffer,
  targetDimensions: { width: number; height: number },
  strategy: "proportional-cover-crop" | "proportional-contain-backdrop" | "exact-match" = "proportional-cover-crop",
): Promise<NormalizationResult> {
  const sharp = eval("require")("sharp");
  const meta = await sharp(inputBuffer).metadata();
  const srcW = meta.width ?? targetDimensions.width;
  const srcH = meta.height ?? targetDimensions.height;

  const telemetry = calculateNormalizationTransform({ width: srcW, height: srcH }, targetDimensions, strategy);

  if (telemetry.strategyUsed === "exact-match") {
    return {
      data: inputBuffer,
      width: targetDimensions.width,
      height: targetDimensions.height,
      scaleX: 1.0,
      scaleY: 1.0,
      uniformScale: 1.0,
      cropBounds: telemetry.cropRectangle,
      strategy: "exact-match",
      telemetry,
    };
  }

  // Cover crop strategy: proportional scaling matching max dimension
  if (telemetry.strategyUsed === "proportional-cover-crop") {
    const scale = telemetry.uniformScaleFactor;
    const scaleX = scale;
    const scaleY = scale;
    if (Math.abs(scaleX - scaleY) > 1e-6) {
      throw new Error("Normalization violation: non-uniform X/Y scaling detected.");
    }

    const { scaledDimensions, cropRectangle } = telemetry;

    const resized = await sharp(inputBuffer)
      .resize(scaledDimensions.width, scaledDimensions.height, { fit: "fill" })
      .extract({
        left: cropRectangle.left,
        top: cropRectangle.top,
        width: targetDimensions.width,
        height: targetDimensions.height,
      })
      .png()
      .toBuffer();

    return {
      data: resized,
      width: targetDimensions.width,
      height: targetDimensions.height,
      scaleX,
      scaleY,
      uniformScale: scale,
      cropBounds: cropRectangle,
      strategy: "proportional-cover-crop",
      telemetry,
    };
  }

  // Contain + backdrop strategy
  const scale = telemetry.uniformScaleFactor;
  const scaleX = scale;
  const scaleY = scale;
  const scaledW = telemetry.scaledDimensions.width;
  const scaledH = telemetry.scaledDimensions.height;
  const destLeft = Math.round((targetDimensions.width - scaledW) / 2);
  const destTop = Math.round((targetDimensions.height - scaledH) / 2);

  const backdrop = await sharp(inputBuffer)
    .resize(targetDimensions.width, targetDimensions.height, { fit: "cover" })
    .blur(24)
    .modulate({ brightness: 0.55 })
    .toBuffer();

  const scaledSubject = await sharp(inputBuffer)
    .resize(scaledW, scaledH, { fit: "fill" })
    .toBuffer();

  const composed = await sharp(backdrop)
    .composite([{ input: scaledSubject, left: destLeft, top: destTop }])
    .png()
    .toBuffer();

  return {
    data: composed,
    width: targetDimensions.width,
    height: targetDimensions.height,
    scaleX,
    scaleY,
    uniformScale: scale,
    cropBounds: { left: 0, top: 0, width: scaledW, height: scaledH },
    strategy: "proportional-contain-backdrop",
    telemetry,
  };
}

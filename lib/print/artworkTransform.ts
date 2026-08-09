import type { PxSize } from "./types";

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

  let baseScale = fitScale;
  if (transform.mode === "fill") {
    baseScale = fillScale;
  }

  const effectiveScale = baseScale * (transform.scale || 1.0);
  const width = Math.round(safeSourceW * effectiveScale);
  const height = Math.round(safeSourceH * effectiveScale);

  // Center alignment + normalized offset relative to destination dimensions
  const left = Math.round((safeDestW - width) / 2 + (transform.offsetX || 0) * safeDestW);
  const top = Math.round((safeDestH - height) / 2 + (transform.offsetY || 0) * safeDestH);

  const showBackdrop =
    transform.backgroundMode === "extended" && (width < safeDestW || height < safeDestH);

  return {
    effectiveScale,
    width,
    height,
    left,
    top,
    destWidth: safeDestW,
    destHeight: safeDestH,
    showBackdrop,
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

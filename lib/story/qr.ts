/**
 * Deterministic, application-rendered QR generation for the video-qr page.
 *
 * The illustration prompt for that page NEVER asks the image model to draw a
 * QR code or URL text (see the videoQr scene builder in each story's
 * StoryEdition) — the QR itself is generated here, deterministically, as
 * SVG, and composited by the application over the generated background
 * artwork. This mirrors how personalized story text is already vector-
 * overlaid rather than baked into the illustration prompt.
 */

import QRCode from "qrcode";

/** A stable redirect/token URL, never an editable raw video-provider URL
 *  embedded directly — so the destination can be changed later without
 *  regenerating the QR artwork. */
export interface VideoQrTarget {
  /** Opaque per-book token, e.g. a child+book session id. */
  token: string;
  /** The redirect service's base URL, e.g. "https://storybook.example/v". */
  redirectBaseUrl: string;
}

export function videoQrRedirectUrl(target: VideoQrTarget): string {
  if (!target.token) return target.redirectBaseUrl;
  return `${target.redirectBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(target.token)}`;
}

/**
 * Wraps a directly-configured final HTTPS video URL (e.g. entered by the
 * user in the export form) as a VideoQrTarget, for callers that don't need
 * the token+redirect-base indirection above. `videoQrRedirectUrl()` on the
 * result returns exactly this URL unchanged.
 */
export function directVideoTarget(url: string): VideoQrTarget {
  return { token: "", redirectBaseUrl: url };
}

/** A clearly-labelled placeholder token/URL, valid only for draft export. */
export const DRAFT_VIDEO_QR_PLACEHOLDER: VideoQrTarget = {
  token: "DRAFT-PLACEHOLDER",
  redirectBaseUrl: "https://draft.invalid/not-for-print",
};

export interface VideoQrValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates a video-QR target is real and usable for PRODUCTION export.
 * The draft placeholder is deliberately rejected here — draft export calls
 * this only to label the page, never to gate the (watermarked) download.
 */
export function validateVideoQrTargetForProduction(
  target: VideoQrTarget | null | undefined,
): VideoQrValidationResult {
  if (!target) {
    return { valid: false, reason: "No video link/redirect target is configured." };
  }
  if (!target.redirectBaseUrl || target.redirectBaseUrl.trim().length === 0) {
    return { valid: false, reason: "Video QR target URL is empty." };
  }
  if (target === DRAFT_VIDEO_QR_PLACEHOLDER || (target.token && target.token === DRAFT_VIDEO_QR_PLACEHOLDER.token)) {
    return { valid: false, reason: "Video QR target is still the draft placeholder — not valid for production." };
  }
  // A token-based target (see VideoQrTarget) requires a non-empty token —
  // an empty token is only valid for a directVideoTarget() (direct final
  // URL, no redirect indirection), which is distinguished by having no
  // separate path segment to append.
  let url: URL;
  try {
    url = new URL(videoQrRedirectUrl(target));
  } catch {
    return { valid: false, reason: "Video QR redirect URL is not a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { valid: false, reason: "Video QR redirect URL must use https." };
  }
  return { valid: true };
}

export interface QrSvgOptions {
  /** SVG pixel size of the quiet-zone margin, in QR modules (quiet zone is
   *  part of the QR standard — never crop it). Default 4 modules, the
   *  standard minimum. */
  marginModules?: number;
}

/** Renders the QR as a deterministic SVG string for the given URL. Pure/sync
 *  aside from the qrcode library's internal (offline, non-network) encoding. */
export async function renderVideoQrSvg(url: string, options: QrSvgOptions = {}): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: options.marginModules ?? 4,
    errorCorrectionLevel: "M",
  });
}

/** Renders the QR as a PNG buffer at the given pixel size (for compositing
 *  into a raster page or for the decode round-trip test). */
export async function renderVideoQrPng(url: string, pixelSize: number): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width: pixelSize,
    margin: 4,
    errorCorrectionLevel: "M",
  });
}

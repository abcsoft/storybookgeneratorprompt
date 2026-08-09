/**
 * Lulu Cover Geometry Spec Architecture.
 *
 * Enforces strict spine width safety. Lulu spine width depends on exact paper,
 * page count, and binding option. If exact authoritative template geometry has
 * not been provided, we DO NOT fabricate or invent spine dimensions — we mark
 * `cover.pdf` as pending template while keeping `interior.pdf` production-ready.
 */

import type { PrintProfile } from "./types";

export interface LuluCoverSpec {
  totalWidthIn: number;
  totalHeightIn: number;
  spineWidthIn: number;
  frontWidthIn: number;
  backWidthIn: number;
  bleedIn: number;
  authoritative: boolean;
  sourceNote?: string;
}

export function createPendingLuluCoverSpec(profile: PrintProfile): LuluCoverSpec {
  const bleed = profile.bleedIn ?? 0.125;
  const frontW = profile.nominalSizeIn.width + bleed * 2;
  const height = profile.nominalSizeIn.height + bleed * 2;
  return {
    totalWidthIn: frontW * 2,
    totalHeightIn: height,
    spineWidthIn: 0,
    frontWidthIn: frontW,
    backWidthIn: frontW,
    bleedIn: bleed,
    authoritative: false,
    sourceNote:
      "Cover template pending: authoritative Lulu template dimensions not provided. " +
      "Provide exact Lulu template specification to render production-ready wrap cover.",
  };
}

export function createAuthoritativeLuluCoverSpec(input: {
  totalWidthIn: number;
  totalHeightIn: number;
  spineWidthIn: number;
  frontWidthIn: number;
  backWidthIn: number;
  bleedIn?: number;
  sourceNote?: string;
}): LuluCoverSpec {
  return {
    totalWidthIn: input.totalWidthIn,
    totalHeightIn: input.totalHeightIn,
    spineWidthIn: input.spineWidthIn,
    frontWidthIn: input.frontWidthIn,
    backWidthIn: input.backWidthIn,
    bleedIn: input.bleedIn ?? 0.125,
    authoritative: true,
    sourceNote: input.sourceNote ?? "Authoritative Lulu cover template geometry.",
  };
}

export function isLuluCoverReady(spec?: LuluCoverSpec): boolean {
  return Boolean(spec && spec.authoritative === true && spec.spineWidthIn > 0);
}

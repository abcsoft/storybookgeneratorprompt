/**
 * Print-profile registry — the one place that knows about every supported
 * physical product. To add a profile later (Printify landscape, Printify
 * softcover, Lulu square, …): create a file under `profiles/` exporting a
 * `PrintProfile` and add it to `PRINT_PROFILES`. Mirrors the shape of
 * `lib/story/registry.ts`.
 */

import { classicLandscapeProfile } from "./profiles/classicLandscape";
import { printifyHardcoverSquare8x8Profile } from "./profiles/printifyHardcoverSquare8x8";
import { luluPremiumColorLandscape11x85Profile } from "./profiles/luluPremiumColorLandscape11x85";
import { luluPremiumColorSquare85x85Profile } from "./profiles/luluPremiumColorSquare85x85";
import type { PrintProfile } from "./types";

export const DEFAULT_PRINT_PROFILE_ID = classicLandscapeProfile.id;

export const PRINT_PROFILES: PrintProfile[] = [
  classicLandscapeProfile,
  printifyHardcoverSquare8x8Profile,
  luluPremiumColorLandscape11x85Profile,
  luluPremiumColorSquare85x85Profile,
];

export function listPrintProfiles(): PrintProfile[] {
  return PRINT_PROFILES;
}

/** Resolve a profile by id, falling back to the default if unknown. */
export function getPrintProfile(id?: string): PrintProfile {
  return PRINT_PROFILES.find((p) => p.id === id) ?? PRINT_PROFILES[0];
}

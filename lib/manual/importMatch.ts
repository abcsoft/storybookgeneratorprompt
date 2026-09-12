/**
 * Smart bulk-import matching with authoritative slot identity and guarded legacy recovery.
 *
 * Matching Priority:
 * 1. manifest asset ID / slotId
 * 2. exact canonical filename
 * 3. validated legacy numeric filename / aliases
 *
 * Never assigns uploaded files merely by sorted array position.
 * Rejects duplicate slot assignments and unknown assets.
 */

import { indexFromFilename, parseFilename } from "./filenameMatch";
import { resolveLayoutPlan, type LayoutMode, type CustomSpreadSelection, type ResolvedAssetSlot } from "../story/layoutPlan";
import type { ChildProfile } from "../story/types";

export interface LegacyAdapterContext {
  bookId: string;
  profileId: string;
  mode?: LayoutMode;
  customSpreads?: CustomSpreadSelection[];
  child?: ChildProfile;
}

/**
 * Explicit legacy compatibility adapter: resolves real layout plan assets using
 * real profile and layout metadata.
 * Never silently assumes Classic Landscape or single-page layout.
 */
export function adaptLegacyFilenamesToResolvedSlots(
  requiredFilenames: string[],
  context: LegacyAdapterContext,
): ResolvedAssetSlot[] {
  const child = context.child ?? { name: "Alex", age: 4, gender: "boy" as const };
  const plan = resolveLayoutPlan({
    child,
    bookId: context.bookId,
    profileId: context.profileId,
    mode: context.mode,
    customSpreads: context.customSpreads,
  });
  return plan.assets;
}

export interface ImportMissingSlot {
  slotId: string;
  physicalPages: number[];
  role?: string;
  expectedFilename: string;
}

export interface ImportDuplicateSlot {
  filename: string;
  slotId?: string;
  index: number;
  claimedBy: string;
}

export interface LegacyRecoveryProposalTableEntry {
  filename: string;
  proposedSlotId: string;
  role: string;
  physicalPages: number[];
}

export type LegacyInterpretation = "SHIFT_PLUS_TWO" | "KEEP_NUMERIC_SLOTS";

export interface LegacyRecoveryChoice {
  interpretation: LegacyInterpretation;
  label: string;
  description: string;
  mappingTable: LegacyRecoveryProposalTableEntry[];
  resultingMissingSlots: ImportMissingSlot[];
}

export interface ImportMatchReport {
  /** Total required illustrations for this storybook. */
  required: number;
  /** Number of unique required pages that matched a provided file. */
  matched: number;
  assignedCount: number;
  /** Required filenames with no provided file. */
  missing: string[];
  /** Slot IDs with no provided file. */
  missingSlots: string[];
  missingSlotDetails?: ImportMissingSlot[];
  /** Extra files that resolve to a slot another file already claimed. */
  duplicates: ImportDuplicateSlot[];
  /** Provided filenames that don't match any slot. */
  unmatched: string[];
  unexpected: string[];
  /** The file to use for each page index, after resolving matches/duplicates. */
  byIndex: Map<number, string>;
  bySlotId: Map<string, string>;
  matchedSlots: Map<string, string>;
  /** Migration warnings when legacy numbered files are used instead of canonical names. */
  migrationWarnings: string[];
  legacyRecoveryProposal?: string | null;
  legacyRecoveryTable?: LegacyRecoveryProposalTableEntry[];
  legacyRecoveryApplied?: boolean;
  /** Two human-readable interpretation choices for ambiguous packages. */
  legacyRecoveryChoices?: LegacyRecoveryChoice[];
}

export interface ManifestItem {
  filename: string;
  role?: string;
  roleSlug?: string;
  slotId?: string;
  kind?: string;
}

export interface MatchImportedFilesOptions {
  resolvedSlots?: ResolvedAssetSlot[];
  confirmLegacyOffsetRecovery?: boolean;
  /** Explicit user-selected interpretation for ambiguous legacy packages. */
  legacyInterpretation?: LegacyInterpretation;
  bookId?: string;
  manifest?: ManifestItem[];
  /** Explicit legacy adapter context when only filenames are available */
  legacyAdapterContext?: LegacyAdapterContext;
}

const DREAM_BIG_CAREER_ROLES = [
  "pilot",
  "race-car-driver",
  "astronaut",
  "doctor",
  "firefighter",
  "scientist",
  "army-officer",
  "soccer-player",
  "karate-master",
  "detective",
  "magician",
  "chef",
  "rockstar",
  "artist",
  "teacher",
  "explorer",
  "photographer",
  "deep-sea-diver",
  "veterinarian",
  "inventor",
  "closing",
  "backcover",
];

/**
 * Checks whether the uploaded 22 files match the career+closing+backcover sequence (pilot to backcover).
 */
function isDreamBig22LegacySequence(
  filenames: string[],
  slots?: ResolvedAssetSlot[],
  manifest?: ManifestItem[],
): boolean {
  if (filenames.length !== 22) return false;

  // 1. If manifest specifies 22 career roles without cover/intro
  if (manifest && manifest.length === 22) {
    const roles = manifest.map((m) => (m.roleSlug ?? m.role ?? "").toLowerCase());
    const hasCover = roles.some((r) => r.includes("cover"));
    const hasIntro = roles.some((r) => r.includes("intro"));
    if (!hasCover && !hasIntro) return true;
  }

  // 2. Check role-based names matching pilot ... backcover
  let careerMatches = 0;
  for (const f of filenames) {
    const low = f.toLowerCase();
    if (DREAM_BIG_CAREER_ROLES.some((role) => low.includes(role.replace(/-/g, "")) || low.includes(role))) {
      careerMatches++;
    }
  }
  if (careerMatches >= 18) {
    return true;
  }

  // 3. Check if filenames are numbered 01..22 or 1..22
  const nums = filenames
    .map((f) => {
      const p = parseFilename(f);
      return p.pageNumber ?? (indexFromFilename(f) !== null ? indexFromFilename(f)! + 1 : null);
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  if (nums.length === 22 && nums[0] === 1 && nums[21] === 22) {
    return true;
  }

  return false;
}

/**
 * Match uploaded files against authoritative resolved slots or expected filenames.
 */
export function matchImportedFiles(
  providedFilenames: string[],
  requiredFilenamesOrSlots: string[] | ResolvedAssetSlot[],
  resolvedSlotsOrOptions?: ResolvedAssetSlot[] | MatchImportedFilesOptions | boolean,
  optionsOrUndefined?: MatchImportedFilesOptions,
): ImportMatchReport {
  let requiredFilenames: string[] = [];
  let resolvedSlots: ResolvedAssetSlot[] | undefined;
  let options: MatchImportedFilesOptions = {};

  if (Array.isArray(requiredFilenamesOrSlots) && requiredFilenamesOrSlots.length > 0 && typeof (requiredFilenamesOrSlots[0] as any) !== "string") {
    resolvedSlots = requiredFilenamesOrSlots as ResolvedAssetSlot[];
    requiredFilenames = resolvedSlots.map((s) => s.expectedFilename ?? s.filename);
  } else if (Array.isArray(requiredFilenamesOrSlots)) {
    requiredFilenames = requiredFilenamesOrSlots as string[];
  }

  if (typeof resolvedSlotsOrOptions === "boolean") {
    options = { confirmLegacyOffsetRecovery: resolvedSlotsOrOptions };
  } else if (Array.isArray(resolvedSlotsOrOptions)) {
    resolvedSlots = resolvedSlotsOrOptions;
    if (optionsOrUndefined) options = optionsOrUndefined;
  } else if (resolvedSlotsOrOptions && typeof resolvedSlotsOrOptions === "object") {
    options = resolvedSlotsOrOptions;
    if (options.resolvedSlots) resolvedSlots = options.resolvedSlots;
  } else if (optionsOrUndefined) {
    options = optionsOrUndefined;
    if (options.resolvedSlots) resolvedSlots = options.resolvedSlots;
  }

  if (!resolvedSlots && options.legacyAdapterContext) {
    resolvedSlots = adaptLegacyFilenamesToResolvedSlots(requiredFilenames, options.legacyAdapterContext);
  }

  const byIndex = new Map<number, string>();
  const bySlotId = new Map<string, string>();
  const duplicates: ImportDuplicateSlot[] = [];
  const unmatched: string[] = [];
  const migrationWarnings: string[] = [];
  const seenFilenames = new Set<string>();

  const totalSlots = resolvedSlots ? resolvedSlots.length : requiredFilenames.length;

  // 1. Guarded Legacy Recovery Flow Check
  // MUST RUN BEFORE ANY GENERIC NUMERIC ALIAS ASSIGNMENT
  let legacyRecoveryProposal: string | null = null;
  let legacyRecoveryApplied = false;

  // Scope legacy detection to Dream Big templates or manifest declarations:
  // If bookId is explicitly specified, it must be "dream-big".
  // If bookId is not specified, inspect manifest or resolved slot roles (e.g. 03-pilot).
  // Do NOT use generic totalSlots === 24 as proof.
  const isDreamBig = options.bookId
    ? options.bookId === "dream-big"
    : Boolean(
        (options.manifest && options.manifest.length === 22) ||
        (resolvedSlots && resolvedSlots.some((s) => s.slotId === "03-pilot" || s.roleSlug === "pilot" || s.expectedFilename?.includes("pilot")))
      );
  const is22Legacy = isDreamBig && isDreamBig22LegacySequence(providedFilenames, resolvedSlots, options.manifest);

  if (is22Legacy) {
    if (!options.confirmLegacyOffsetRecovery && !options.legacyInterpretation) {
      legacyRecoveryProposal = "Cover and intro appear to be missing. Map these 22 assets to slots 3–24?";
    } else if (options.legacyInterpretation === "SHIFT_PLUS_TWO" || options.confirmLegacyOffsetRecovery) {
      legacyRecoveryApplied = true;
    } else if (options.legacyInterpretation === "KEEP_NUMERIC_SLOTS") {
      // Will be handled in the KEEP_NUMERIC_SLOTS path below
    }
  }

  // If 22 legacy assets detected without user confirmation:
  // DO NOT assign 01.png to 01-cover or 02.png to 02-intro!
  // Offer the guarded +2 recovery proposal table and keep slots 01-cover and 02-intro visibly missing.
  if (is22Legacy && !options.confirmLegacyOffsetRecovery && !options.legacyInterpretation && resolvedSlots && resolvedSlots.length >= 24) {
    const sortedFiles = [...providedFilenames].sort((a, b) => {
      const na = indexFromFilename(a) ?? 0;
      const nb = indexFromFilename(b) ?? 0;
      return na - nb;
    });

    // Build SHIFT_PLUS_TWO table: map 01..22 to slots 03..24
    const shiftPlusTwoTable: LegacyRecoveryProposalTableEntry[] = [];
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const targetSlot = resolvedSlots[i + 2];
      if (targetSlot) {
        shiftPlusTwoTable.push({
          filename: file,
          proposedSlotId: targetSlot.slotId,
          role: targetSlot.roleSlug,
          physicalPages: targetSlot.physicalPages,
        });
      }
    }
    const shiftPlusTwoMissing: ImportMissingSlot[] = resolvedSlots.slice(0, 2).map((s) => ({
      slotId: s.slotId,
      physicalPages: s.physicalPages,
      role: s.role,
      expectedFilename: s.expectedFilename ?? s.filename,
    }));

    // Build KEEP_NUMERIC_SLOTS table: map 01..22 to slots 01..22
    const keepNumericTable: LegacyRecoveryProposalTableEntry[] = [];
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const targetSlot = resolvedSlots[i];
      if (targetSlot) {
        keepNumericTable.push({
          filename: file,
          proposedSlotId: targetSlot.slotId,
          role: targetSlot.roleSlug,
          physicalPages: targetSlot.physicalPages,
        });
      }
    }
    const keepNumericMissing: ImportMissingSlot[] = resolvedSlots.slice(22).map((s) => ({
      slotId: s.slotId,
      physicalPages: s.physicalPages,
      role: s.role,
      expectedFilename: s.expectedFilename ?? s.filename,
    }));

    const legacyRecoveryChoices: LegacyRecoveryChoice[] = [
      {
        interpretation: "SHIFT_PLUS_TWO",
        label: "Files are Pilot through Back Cover (Cover & Intro missing)",
        description: "Map 01.png–22.png to slots 03–24. Slots 01-cover and 02-intro remain missing.",
        mappingTable: shiftPlusTwoTable,
        resultingMissingSlots: shiftPlusTwoMissing,
      },
      {
        interpretation: "KEEP_NUMERIC_SLOTS",
        label: "Files are Cover through Inventor (Closing & Back Cover missing)",
        description: "Map 01.png–22.png to slots 01–22. Slots 23-closing and 24-backcover remain missing.",
        mappingTable: keepNumericTable,
        resultingMissingSlots: keepNumericMissing,
      },
    ];

    // All slots reported as missing (no assignment until user chooses)
    const missingSlots: string[] = [];
    const missingSlotDetails: ImportMissingSlot[] = [];
    const missing: string[] = [];

    for (const s of resolvedSlots) {
      missing.push(s.expectedFilename ?? s.filename);
      missingSlots.push(s.slotId);
      missingSlotDetails.push({
        slotId: s.slotId,
        physicalPages: s.physicalPages,
        role: s.role,
        expectedFilename: s.expectedFilename ?? s.filename,
      });
    }

    return {
      required: totalSlots,
      matched: 0,
      assignedCount: 0,
      matchedSlots: bySlotId,
      missing,
      missingSlots,
      missingSlotDetails,
      duplicates,
      unmatched: providedFilenames,
      unexpected: [],
      byIndex,
      bySlotId,
      migrationWarnings: [
        "Legacy 22-asset offset detected: cover and intro are absent. Guarded +2 recovery offered; explicit confirmation required.",
      ],
      legacyRecoveryProposal,
      legacyRecoveryTable: shiftPlusTwoTable,
      legacyRecoveryApplied: false,
      legacyRecoveryChoices,
    };
  }

  // KEEP_NUMERIC_SLOTS explicit path: map 22 files to slots 01..22, keep 23-closing and 24-backcover missing
  if (is22Legacy && options.legacyInterpretation === "KEEP_NUMERIC_SLOTS" && resolvedSlots && resolvedSlots.length >= 24) {
    const sortedFiles = [...providedFilenames].sort((a, b) => {
      const na = indexFromFilename(a) ?? 0;
      const nb = indexFromFilename(b) ?? 0;
      return na - nb;
    });

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (i < resolvedSlots.length) {
        const slot = resolvedSlots[i];
        byIndex.set(i, file);
        bySlotId.set(slot.slotId, file);
        migrationWarnings.push(
          `Numeric mapping: "${file}" mapped to slot "${slot.slotId}" (Physical page ${slot.physicalPages.join(", ")}).`,
        );
      }
    }

    const missingSlots: string[] = [];
    const missingSlotDetails: ImportMissingSlot[] = [];
    const missing: string[] = [];

    for (let i = 0; i < resolvedSlots.length; i++) {
      if (!byIndex.has(i)) {
        const s = resolvedSlots[i];
        missing.push(s.expectedFilename ?? s.filename);
        missingSlots.push(s.slotId);
        missingSlotDetails.push({
          slotId: s.slotId,
          physicalPages: s.physicalPages,
          role: s.role,
          expectedFilename: s.expectedFilename ?? s.filename,
        });
      }
    }

    return {
      required: totalSlots,
      matched: bySlotId.size,
      assignedCount: bySlotId.size,
      matchedSlots: bySlotId,
      missing,
      missingSlots,
      missingSlotDetails,
      duplicates,
      unmatched: [],
      unexpected: [],
      byIndex,
      bySlotId,
      migrationWarnings,
      legacyRecoveryProposal: null,
      legacyRecoveryApplied: false,
    };
  }

  // If user explicitly confirmed legacy recovery: map the 22 assets to slots 3..24 (indices 2..23)
  if (legacyRecoveryApplied && resolvedSlots && resolvedSlots.length >= 24) {
    // Sort provided files naturally
    const sortedFiles = [...providedFilenames].sort((a, b) => {
      const na = indexFromFilename(a) ?? 0;
      const nb = indexFromFilename(b) ?? 0;
      return na - nb;
    });

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const targetSlotIndex = i + 2; // map to slots 3..24 (0-based index 2..23)
      if (targetSlotIndex < resolvedSlots.length) {
        const slot = resolvedSlots[targetSlotIndex];
        byIndex.set(targetSlotIndex, file);
        bySlotId.set(slot.slotId, file);
        migrationWarnings.push(
          `Legacy recovery: "${file}" mapped to slot "${slot.slotId}" (Physical page ${slot.physicalPages.join(", ")}).`,
        );
      }
    }

    const missingSlots: string[] = [];
    const missingSlotDetails: ImportMissingSlot[] = [];
    const missing: string[] = [];

    for (let i = 0; i < resolvedSlots.length; i++) {
      if (!byIndex.has(i)) {
        const s = resolvedSlots[i];
        missing.push(s.expectedFilename ?? s.filename);
        missingSlots.push(s.slotId);
        missingSlotDetails.push({
          slotId: s.slotId,
          physicalPages: s.physicalPages,
          role: s.role,
          expectedFilename: s.expectedFilename ?? s.filename,
        });
      }
    }

    return {
      required: totalSlots,
      matched: bySlotId.size,
      assignedCount: bySlotId.size,
      matchedSlots: bySlotId,
      missing,
      missingSlots,
      missingSlotDetails,
      duplicates,
      unmatched,
      unexpected: unmatched,
      byIndex,
      bySlotId,
      migrationWarnings,
      legacyRecoveryProposal: null,
      legacyRecoveryApplied: true,
    };
  }

  // 2. Standard Authoritative Matching
  if (resolvedSlots && resolvedSlots.length > 0) {
    for (const filename of providedFilenames) {
      if (seenFilenames.has(filename)) {
        const idx = indexFromFilename(filename) ?? -1;
        duplicates.push({ filename, slotId: "duplicate-file", index: idx, claimedBy: filename });
        continue;
      }
      seenFilenames.add(filename);

      const norm = filename.toLowerCase();
      const base = norm.replace(/\.[^/.]+$/, "").trim();

      let matchedSlot: ResolvedAssetSlot | null = null;

      // Priority 1: manifest asset ID / slotId
      matchedSlot =
        resolvedSlots.find(
          (s) => s.slotId.toLowerCase() === base || s.slotId.toLowerCase() === norm,
        ) ?? null;

      // Priority 2: exact canonical filename
      if (!matchedSlot) {
        matchedSlot =
          resolvedSlots.find(
            (s) =>
              s.expectedFilename.toLowerCase() === norm ||
              s.filename.toLowerCase() === norm ||
              s.expectedFilename.toLowerCase().replace(/\.[^/.]+$/, "") === base,
          ) ?? null;
      }

      // Priority 3: manifest role matching (when manifest is available, map by semantic role before generic numeric aliases)
      if (!matchedSlot && options.manifest) {
        const mItem = options.manifest.find(
          (m) => m.filename.toLowerCase() === norm || m.filename.toLowerCase().replace(/\.[^/.]+$/, "") === base,
        );
        if (mItem) {
          if (mItem.slotId) {
            matchedSlot = resolvedSlots.find((s) => s.slotId.toLowerCase() === mItem.slotId!.toLowerCase()) ?? null;
          }
          if (!matchedSlot && (mItem.roleSlug || mItem.role)) {
            const r = (mItem.roleSlug ?? mItem.role!).toLowerCase();
            matchedSlot =
              resolvedSlots.find(
                (s) =>
                  s.roleSlug.toLowerCase() === r ||
                  s.role?.toLowerCase() === r ||
                  s.sourceSceneRole?.toLowerCase() === r,
              ) ?? null;
          }
        }
      }

      // Priority 4: validated legacy numeric filename / aliases
      if (!matchedSlot) {
        matchedSlot =
          resolvedSlots.find((s) =>
            s.legacyAliases.some(
              (alias) =>
                alias.toLowerCase() === norm ||
                alias.toLowerCase().replace(/\.[^/.]+$/, "") === base,
            ),
          ) ?? null;
      }

      // Fallback structural parsing
      if (!matchedSlot) {
        const parsed = parseFilename(filename);
        if (parsed.kind === "slot" && parsed.slotId) {
          matchedSlot =
            resolvedSlots.find(
              (s) => s.slotId.toLowerCase() === parsed.slotId!.toLowerCase(),
            ) ?? null;
        } else if (parsed.kind === "front-cover") {
          matchedSlot = resolvedSlots.find((s) => s.kind === "cover" || s.pageKind === "cover") ?? null;
        } else if (parsed.kind === "back-cover") {
          matchedSlot =
            resolvedSlots.find((s) => s.kind === "backcover" || s.pageKind === "backcover") ?? null;
        } else if (parsed.kind === "spread" && parsed.spreadPages) {
          matchedSlot =
            resolvedSlots.find(
              (s) =>
                s.assetKind === "spread" &&
                s.physicalPages[0] === parsed.spreadPages![0] &&
                s.physicalPages[1] === parsed.spreadPages![1],
            ) ?? null;
        } else if (parsed.kind === "page" && parsed.pageNumber !== undefined) {
          matchedSlot =
            resolvedSlots.find(
              (s) => s.assetKind === "single-page" && s.physicalPages.includes(parsed.pageNumber!),
            ) ?? null;
        } else if (parsed.isLegacy && parsed.index !== undefined) {
          // Guarded legacy numeric index: only map if within bounds and not intercepted by recovery proposal
          if (!legacyRecoveryProposal && parsed.index >= 0 && parsed.index < resolvedSlots.length) {
            matchedSlot = resolvedSlots[parsed.index];
            migrationWarnings.push(
              `Legacy filename "${filename}" was mapped to slot "${matchedSlot.slotId}".`,
            );
          }
        }
      }

      if (!matchedSlot) {
        unmatched.push(filename);
        continue;
      }

      const targetIndex = resolvedSlots.findIndex((s) => s.slotId === matchedSlot!.slotId);
      const existing = bySlotId.get(matchedSlot.slotId);
      if (existing) {
        duplicates.push({
          filename,
          slotId: matchedSlot.slotId,
          index: targetIndex,
          claimedBy: existing,
        });
        continue;
      }

      byIndex.set(targetIndex, filename);
      bySlotId.set(matchedSlot.slotId, filename);
    }

    const missingSlots: string[] = [];
    const missingSlotDetails: ImportMissingSlot[] = [];
    const missing: string[] = [];

    for (let i = 0; i < resolvedSlots.length; i++) {
      const s = resolvedSlots[i];
      if (!bySlotId.has(s.slotId)) {
        missing.push(s.expectedFilename ?? s.filename);
        missingSlots.push(s.slotId);
        missingSlotDetails.push({
          slotId: s.slotId,
          physicalPages: s.physicalPages,
          role: s.role,
          expectedFilename: s.expectedFilename ?? s.filename,
        });
      }
    }

    return {
      required: totalSlots,
      matched: bySlotId.size,
      assignedCount: bySlotId.size,
      matchedSlots: bySlotId,
      missing,
      missingSlots,
      missingSlotDetails,
      duplicates,
      unmatched,
      unexpected: unmatched,
      byIndex,
      bySlotId,
      migrationWarnings,
      legacyRecoveryProposal,
      legacyRecoveryApplied: false,
    };
  }

  // Fallback if resolvedSlots was not provided (legacy filename list path)
  const reqLowerMap = new Map<string, number>();
  requiredFilenames.forEach((req, idx) => {
    reqLowerMap.set(req.toLowerCase(), idx);
    reqLowerMap.set(req.replace(/\.[^/.]+$/, "").toLowerCase(), idx);
  });

  for (const filename of providedFilenames) {
    const norm = filename.toLowerCase();
    const base = norm.replace(/\.[^/.]+$/, "");

    if (seenFilenames.has(filename)) {
      const idx = indexFromFilename(filename) ?? -1;
      duplicates.push({ filename, index: idx, claimedBy: filename });
      continue;
    }
    seenFilenames.add(filename);

    let targetIndex: number | null = null;
    if (reqLowerMap.has(norm)) {
      targetIndex = reqLowerMap.get(norm)!;
    } else if (reqLowerMap.has(base)) {
      targetIndex = reqLowerMap.get(base)!;
    } else {
      const parsed = parseFilename(filename);
      if (parsed.kind === "front-cover") {
        targetIndex = 0;
      } else if (parsed.kind === "back-cover") {
        targetIndex = requiredFilenames.length - 1;
      } else if (parsed.kind === "spread" && parsed.spreadPages) {
        const p1Str = String(parsed.spreadPages[0]).padStart(2, "0");
        const p2Str = String(parsed.spreadPages[1]).padStart(2, "0");
        const spreadKey = `spread-${p1Str}-${p2Str}`;
        const found = requiredFilenames.findIndex((r) => r.toLowerCase().includes(spreadKey));
        if (found !== -1) targetIndex = found;
      } else if (parsed.kind === "page" && parsed.pageNumber !== undefined) {
        const pStr = String(parsed.pageNumber).padStart(2, "0");
        const pageKey = `page-${pStr}`;
        const found = requiredFilenames.findIndex((r) => r.toLowerCase().includes(pageKey));
        if (found !== -1) {
          targetIndex = found;
        } else if (parsed.pageNumber >= 1 && parsed.pageNumber <= requiredFilenames.length) {
          targetIndex = parsed.pageNumber - 1;
        }
      } else if (parsed.isLegacy && parsed.index !== undefined) {
        if (!legacyRecoveryProposal && parsed.index >= 0 && parsed.index < requiredFilenames.length) {
          targetIndex = parsed.index;
        }
      }
    }

    if (targetIndex === null || targetIndex < 0 || targetIndex >= requiredFilenames.length) {
      unmatched.push(filename);
      continue;
    }

    const existing = byIndex.get(targetIndex);
    if (existing) {
      duplicates.push({ filename, index: targetIndex, claimedBy: existing });
      continue;
    }

    byIndex.set(targetIndex, filename);
    bySlotId.set(`slot-${targetIndex}`, filename);
  }

  const missing = requiredFilenames.filter((_, i) => !byIndex.has(i));
  const missingSlots: string[] = missing.map((_, i) => `slot-${i}`);
  const missingSlotDetails: ImportMissingSlot[] = missing.map((f, i) => ({
    slotId: `slot-${i}`,
    physicalPages: [i + 1],
    expectedFilename: f,
  }));

  return {
    required: requiredFilenames.length,
    matched: byIndex.size,
    assignedCount: byIndex.size,
    matchedSlots: bySlotId,
    missing,
    missingSlots,
    missingSlotDetails,
    duplicates,
    unmatched,
    unexpected: unmatched,
    byIndex,
    bySlotId,
    migrationWarnings,
    legacyRecoveryProposal,
    legacyRecoveryApplied: false,
  };
}

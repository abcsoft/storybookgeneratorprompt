/**
 * Manual ("bring your own images") workflow — prompt manifest.
 *
 * Produces, for a given child, the full set of 24 personalized prompts plus the
 * exact filename to save each generated image as. This lets you generate the
 * images for free in the Gemini app (using your Pro plan) and feed them back in,
 * instead of paying for API calls.
 */

import { getPrintProfile } from "../print/registry";
import { characterAnchorPrompt } from "../story/prompt/characterAnchor";
import { buildPages, DEFAULT_BOOK_ID, getBook } from "../story/registry";
import type { ChildProfile, PageLayout } from "../story/types";

export interface ManualPage {
  slotId?: string;
  roleSlug?: string;
  expectedFilename?: string;
  canonicalFilename?: string;
  /** 1-based illustration number (1 for 01-cover.png). */
  illustrationNumber?: number;
  /** 0-based illustration index (0, 1, 2...). */
  illustrationIndex?: number;
  /** 1-based illustration number, matching saved filename (backward compatibility). */
  page: number;
  /** 0-based template index (backward compatibility). */
  index: number;
  kind: string;
  role?: string;
  /** Canonical filename to save the generated image as, e.g. "01-cover.png". */
  filename: string;
  prompt: string;
  text: string;
  /** True for a two-page spread (generate the image extra-wide). */
  spread: boolean;
  /** Authoritative page layout model ("single" or "spread"). */
  pageLayout?: PageLayout;
  /** Aspect ratio to set in the Gemini app, e.g. "3:2" or "21:9". */
  aspect: string;
  /** Authoritative physical interior page numbers. Empty for covers. */
  physicalPages?: number[];
  legacyAliases?: string[];
  resolvedSlot?: ResolvedAssetSlot;
}

/** Zero-padded 1-based filename for a page index, e.g. 0 -> "01.png". */
export function imageFilename(index: number): string {
  return `${String(index + 1).padStart(2, "0")}.png`;
}

/**
 * @param profileId Which print profile's aspect ratios to use for the
 *   generated images. Defaults to the classic landscape profile, so existing
 *   callers (no `profileId` passed) get byte-identical output to before the
 *   print-profile system existed.
 */
import { resolveLayoutPlan, type LayoutMode, type CustomSpreadSelection, type ResolvedAssetSlot } from "../story/layoutPlan";

export function buildManifest(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
  profileId?: string,
  mode?: LayoutMode,
  customSpreads?: CustomSpreadSelection[],
): ManualPage[] {
  const profile = getPrintProfile(profileId);
  const plan = resolveLayoutPlan({ child, bookId, profileId: profile.id, mode, customSpreads });
  return plan.assets.map((slot, assetIndex) => {
    const illNumber = assetIndex + 1;
    const isSpread = slot.assetKind === "spread";
    const layout: PageLayout = isSpread ? "spread" : "single";
    const chosenFilename = slot.filename;

    return {
      slotId: slot.slotId,
      roleSlug: slot.roleSlug,
      expectedFilename: slot.expectedFilename ?? slot.filename,
      illustrationNumber: illNumber,
      illustrationIndex: assetIndex,
      index: assetIndex,
      page: slot.physicalPages[0] ?? illNumber,
      kind: slot.pageKind ?? (slot.assetKind === "front-cover" ? "cover" : slot.assetKind === "back-cover" ? "backcover" : "story"),
      role: slot.sourceSceneRole,
      filename: chosenFilename,
      canonicalFilename: slot.filename,
      legacyAliases: slot.legacyAliases,
      prompt: slot.prompt,
      text: slot.storyText,
      spread: isSpread,
      pageLayout: layout,
      aspect: slot.expectedSourceAspect,
      targetCanvasAspect: slot.targetCanvasAspect,
      physicalPages: slot.physicalPages,
      resolvedSlot: slot,
    };
  });
}

/** A human-readable prompts.md the user can follow in the Gemini app. */
export function renderPromptsMarkdown(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
  profileId?: string,
  mode?: LayoutMode,
  customSpreads?: CustomSpreadSelection[],
): string {
  const manifest = buildManifest(child, bookId, profileId, mode, customSpreads);
  const profile = getPrintProfile(profileId);
  const name = child.name;

  const totalPhysicalLeaves = Math.max(
    0,
    ...manifest.flatMap((m) => m.physicalPages ?? []),
  );
  const spreadCount = manifest.filter((m) => m.spread).length;
  const singleAssetCount = manifest.length - spreadCount;

  const modeLabel =
    mode === "custom-spreads"
      ? "Expanded Hybrid — selected scenes add pages"
      : mode === "full-spread-24"
        ? "Full Spread 24-Page Edition"
        : "Standard Single — Complete Story";

  // Ground truth from the same planner every other consumer (API route,
  // UI banner, upload slots) uses — never a separately-guessed count.
  const plan = resolveLayoutPlan({ child, bookId, profileId: profile.id, mode, customSpreads });
  const compatibilityLine = plan.isValidForProfile
    ? `Compatible with ${profile.label}.`
    : `NOT compatible with ${profile.label}: ${plan.limitations?.join(" ") ?? "page count mismatch."}`;

  // A spread is one image file that fills two physical pages, so the file
  // count and the physical-page count only diverge when at least one spread
  // is present — state both explicitly whenever that's true, so a filename
  // like "25-backcover.png" (or "35-backcover.png") is never left
  // unexplained next to a plain image-file count.
  const summaryBlock =
    spreadCount > 0
      ? `Generate **${manifest.length} image assets**:\n` +
        `- ${spreadCount} panoramic spread${spreadCount === 1 ? "" : "s"}\n` +
        `- ${singleAssetCount} single-page asset${singleAssetCount === 1 ? "" : "s"}\n\n` +
        `These assets produce **${totalPhysicalLeaves} physical PDF pages** (not ${manifest.length} — ` +
        `each spread fills 2 physical pages from 1 image file). Layout mode: **${modeLabel}**. ${compatibilityLine}`
      : `Generate **${manifest.length} image assets** (all single-page — no spreads), producing **${totalPhysicalLeaves} physical PDF pages**. ` +
        `Layout mode: **${modeLabel}**. ${compatibilityLine}`;

  const header = `# ${name}'s ${getBook(bookId).title} — image prompts

${summaryBlock}

Generate these **${manifest.length} image files** **for free** in the Gemini app
(Nano Banana 2), then feed them back into the storybook builder.

## Photos to use
Pick **2–4 clear, front-facing, well-lit close-ups of just ${name}'s face** —
upright, no group shots, hats, or sunglasses. Sharper, simpler photos give a far
better likeness than busy or sideways ones.

## Step 0 — make a character reference (do this first!)
This one step is what keeps every page looking like the *same* ${name}:
1. Open the Gemini app, start **one** chat, and attach your ${name} photos.
2. Paste this prompt (a square **1:1** portrait) and save the result as
   **\`00-character.png\`**:

> ${characterAnchorPrompt(child)}

3. If it doesn't look like ${name}, regenerate until it does — this portrait is
   your anchor for every page.

## Then for each illustration (01–${manifest.length})
1. In the **same chat**, attach **\`00-character.png\` plus one real photo**.
2. **Set the aspect ratio** shown for the illustration — most are **${profile.singleAspect}**; the
   few marked **WIDE SPREAD** are **${profile.spreadAspect}** (they print across two pages).
3. Paste the prompt and **save with the exact filename shown** (e.g. \`01.png\`).
4. Upload all images in the website's "I'll make the images" mode (or run
   \`npm run assemble\`) to build the PDF.

> Staying in one chat with the character reference attached keeps ${name}
> consistent across all ${manifest.length} illustrations.

---
`;

  const body = manifest
    .map((m) => {
      const label = m.role ? `${m.role}` : m.kind.toUpperCase();
      const aspectLabel = m.spread ? `${m.aspect} · WIDE SPREAD` : m.aspect;
      const num = String(m.illustrationNumber).padStart(2, "0");
      const altSave = m.filename !== `${num}.png` ? ` (or save as \`${num}.png\`)` : "";
      const slot = m.resolvedSlot;
      const pages = (m.physicalPages ?? []).join("–");
      const dims = slot?.destinationDimensions
        ? `${slot.destinationDimensions.width}×${slot.destinationDimensions.height} px`
        : "n/a";
      const preset = slot?.providerPresetAspect ?? m.aspect;
      const legacyAliases = (m.legacyAliases ?? []).filter((a) => a !== m.filename);
      const metaLine =
        `**Slot:** \`${m.slotId ?? m.filename}\` · **Physical page${(m.physicalPages ?? []).length === 1 ? "" : "s"}:** ${pages || "n/a"} · ` +
        `**Asset kind:** ${slot?.assetKind ?? (m.spread ? "spread" : "single-page")}\n` +
        `**Target canvas:** ${dims} · **Provider preset:** ${preset} · ` +
        `**Text side:** ${slot?.textSide ?? "n/a"} · **Subject side:** ${slot?.subjectSide ?? "n/a"}` +
        (legacyAliases.length > 0
          ? `\n**Legacy aliases (older filenames some tooling may still look for — do not confuse with the canonical filename above):** ${legacyAliases.map((a) => `\`${a}\``).join(", ")}`
          : "");
      return `### Illustration ${num} · ${label} · ${aspectLabel} → save as \`${m.filename}\`${altSave}

${metaLine}

**Prompt:**
${m.prompt}

_Page text (for reference — do not put this in the image):_ ${m.text.replace(/\n+/g, " ")}
`;
    })
    .join("\n---\n\n");

  return `${header}\n${body}`;
}

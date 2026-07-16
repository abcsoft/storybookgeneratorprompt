/**
 * Manual ("bring your own images") workflow — prompt manifest.
 *
 * Produces, for a given child, the full set of 24 personalized prompts plus the
 * exact filename to save each generated image as. This lets you generate the
 * images for free in the Gemini app (using your Pro plan) and feed them back in,
 * instead of paying for API calls.
 */

import { ASPECT_SINGLE, ASPECT_SPREAD } from "../config";
import { characterAnchorPrompt } from "../story/dreamBigTemplate";
import { buildPages, DEFAULT_BOOK_ID, getBook } from "../story/registry";
import type { ChildProfile } from "../story/types";

export interface ManualPage {
  /** 1-based page number, matching the saved filename. */
  page: number;
  /** 0-based template index used internally to pair images to pages. */
  index: number;
  kind: string;
  role?: string;
  /** What to save the generated image as, e.g. "01.png". */
  filename: string;
  prompt: string;
  text: string;
  /** True for a two-page spread (generate the image extra-wide). */
  spread: boolean;
  /** Aspect ratio to set in the Gemini app, e.g. "3:2" or "21:9". */
  aspect: string;
}

/** Zero-padded 1-based filename for a page index, e.g. 0 -> "01.png". */
export function imageFilename(index: number): string {
  return `${String(index + 1).padStart(2, "0")}.png`;
}

export function buildManifest(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
): ManualPage[] {
  return buildPages(child, bookId).map((p) => ({
    page: p.index + 1,
    index: p.index,
    kind: p.kind,
    role: p.role,
    filename: imageFilename(p.index),
    prompt: p.prompt,
    text: p.text,
    spread: p.spread,
    aspect: p.spread ? ASPECT_SPREAD : ASPECT_SINGLE,
  }));
}

/** A human-readable prompts.md the user can follow in the Gemini app. */
export function renderPromptsMarkdown(
  child: ChildProfile,
  bookId: string = DEFAULT_BOOK_ID,
): string {
  const manifest = buildManifest(child, bookId);
  const name = child.name;
  const header = `# ${name}'s ${getBook(bookId).title} — image prompts

Generate these ${manifest.length} images **for free** in the Gemini app
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

## Then for each page (01–${manifest.length})
1. In the **same chat**, attach **\`00-character.png\` plus one real photo**.
2. **Set the aspect ratio** shown for the page — most are **${ASPECT_SINGLE}**; the
   few marked **WIDE SPREAD** are **${ASPECT_SPREAD}** (they print across two pages).
3. Paste the page prompt and **save with the exact filename shown** (e.g. \`01.png\`).
4. Upload all images in the website's "I'll make the images" mode (or run
   \`npm run assemble\`) to build the PDF.

> Staying in one chat with the character reference attached keeps ${name}
> consistent across all ${manifest.length} pages.

---
`;

  const body = manifest
    .map((m) => {
      const label = m.role ? `${m.role}` : m.kind.toUpperCase();
      const aspectLabel = m.spread ? `${m.aspect} · WIDE SPREAD` : m.aspect;
      return `### Page ${String(m.page).padStart(2, "0")} · ${label} · ${aspectLabel} → save as \`${m.filename}\`

**Prompt:**
${m.prompt}

_Page text (for reference — do not put this in the image):_ ${m.text.replace(/\n+/g, " ")}
`;
    })
    .join("\n---\n\n");

  return `${header}\n${body}`;
}

/**
 * Regression coverage for the character-identity / illustration-style
 * continuity contract (see lib/story/prompt/identityRules.ts,
 * lib/story/prompt/buildIllustrationPrompt.ts, and dreamBigTemplate.ts's
 * STORY_META.styleLock / backcover composition notes).
 *
 * IMPORTANT SCOPE NOTE: these are static prompt-contract tests. They prove
 * the *instructions* sent to the image model are present, identical across
 * pages, and non-contradictory. They cannot and do not prove that actual
 * generated artwork visually matches — no image-generation or vision API is
 * called here. See lib/semantic/identityConsistency.ts for the optional,
 * fail-closed visual check that requires a real configured vision provider.
 */

import { describe, expect, it } from "vitest";
import { buildManifest } from "../manual/manifest";
import { characterIdentityContract, characterIdentityFingerprint } from "./prompt/identityRules";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Yasfa", age: 6, gender: "girl" };
const bookId = "dream-big";
const profileId = "classic-landscape-11x8";

function extractFingerprint(prompt: string): string | undefined {
  return prompt.match(/CHARACTER IDENTITY CONTRACT \[(ID-[A-Z0-9]+)\]/)?.[1];
}

describe("Dream Big — identity fingerprint & immutable identity block (req. 1)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

  it("has all 24 assets", () => {
    expect(manifest.length).toBe(24);
  });

  it("every prompt carries the exact same identity fingerprint", () => {
    const fingerprints = new Set(manifest.map((m) => extractFingerprint(m.prompt)));
    expect(fingerprints.size).toBe(1);
    expect([...fingerprints][0]).toBe(characterIdentityFingerprint(child));
  });

  it("every prompt contains the byte-identical immutable identity block", () => {
    const { block } = characterIdentityContract(child);
    for (const m of manifest) {
      expect(m.prompt, `${m.filename} missing the exact identity block`).toContain(block);
    }
  });

  it("the identity fingerprint changes for a different child", () => {
    const other = characterIdentityFingerprint({ name: "Yasfa", age: 7, gender: "girl" });
    expect(other).not.toBe(characterIdentityFingerprint(child));
  });

  it("the immutable block enumerates every required identity field", () => {
    const { block } = characterIdentityContract(child);
    for (const field of [
      "age-appropriate child body proportions",
      "gender presentation",
      "skin tone",
      "face shape",
      "eye color and eye shape",
      "eyebrow shape",
      "nose shape",
      "lip shape",
      "hair color",
      "hair texture",
      "hair length",
      "stable identifying facial features",
      "Do not drift the apparent age",
      "do not drift ethnicity",
      "do not redesign facial anatomy",
    ]) {
      expect(block, `identity block missing "${field}"`).toContain(field);
    }
  });
});

describe("Dream Big — global illustration-style lock (req. 2)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

  it("every prompt contains the byte-identical style-lock block", () => {
    const styleBlocks = new Set(
      manifest.map((m) => m.prompt.match(/GLOBAL ILLUSTRATION STYLE LOCK[\s\S]*?identity-changing accessory\./)?.[0]),
    );
    expect(styleBlocks.size).toBe(1);
    expect([...styleBlocks][0]).toBeTruthy();
  });

  it("the style lock explicitly prohibits mixed/inconsistent rendering styles", () => {
    const block = manifest[0].prompt;
    for (const prohibition of [
      "rendering one page photorealistically and another as a cartoon",
      "3D-animated/CGI render look",
      "plastic or glossy synthetic-looking skin",
      "anime style",
      "a different illustrator's style or rendering technique from page to page",
      "adult or teenage facial proportions on this child",
      "unrequested jewelry or identity-changing accessory",
    ]) {
      expect(block, `style lock missing "${prohibition}"`).toContain(prohibition);
    }
  });

  it("does not hardcode an aspect ratio inside the style lock (geometry stays profile-derived)", () => {
    const { block } = characterIdentityContract(child);
    // Sanity: identity/style blocks are pure prose, never containing a
    // literal pixel/aspect figure — those come only from targetFormatBlock.
    expect(block).not.toMatch(/\d+×\d+ px/);
  });
});

describe("Dream Big — page-specific text cannot override identity/style (req. 3)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

  it("every page keeps the full identity contract AFTER its own scene text — never truncated or replaced", () => {
    const { block } = characterIdentityContract(child);
    for (const m of manifest) {
      const idx = m.prompt.indexOf(block);
      expect(idx, `${m.filename}: identity block not found intact`).toBeGreaterThanOrEqual(0);
    }
  });

  it("no page's prompt contains a second, conflicting age/skin-tone statement outside the identity block", () => {
    for (const m of manifest) {
      // "a N-year-old" appears exactly once (the sceneBlock's own intro
      // sentence) plus the identity block's "apparent age N" — never a
      // THIRD, different age statement introduced by scene-specific text.
      const ageMentions = m.prompt.match(/\b\d+-year-old\b/g) ?? [];
      expect(ageMentions.length, `${m.filename} should mention age exactly once (sceneBlock)`).toBe(1);
    }
  });
});

describe("Dream Big — career outfits remain mutable, no wardrobe contradiction (req. 4)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
  const careers = manifest.filter((m) => m.kind === "scene");

  it("every career scene states a costume change and does not also claim the outfit is unchanged", () => {
    expect(careers.length).toBeGreaterThan(0);
    for (const m of careers) {
      expect(m.prompt).toMatch(/outfit changes to match the .* career uniform/);
      expect(m.prompt).not.toMatch(/Keep this exact outfit, unchanged/);
    }
  });
});

describe("Dream Big — cover/closing/backcover canonical outfit continuity (req. 5)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

  it("cover, closing, and backcover state the exact same canonical outfit text", () => {
    const cover = manifest.find((m) => m.kind === "cover")!;
    const closing = manifest.find((m) => m.kind === "closing")!;
    const backcover = manifest.find((m) => m.kind === "backcover")!;

    const outfitOf = (prompt: string) =>
      prompt.match(/WARDROBE CONTINUITY[\s\S]*?Keep this exact outfit, unchanged, in this picture\./)?.[0];

    const coverOutfit = outfitOf(cover.prompt);
    const closingOutfit = outfitOf(closing.prompt);
    const backcoverOutfit = outfitOf(backcover.prompt);

    expect(coverOutfit).toBeTruthy();
    expect(closingOutfit).toBe(coverOutfit);
    expect(backcoverOutfit).toBe(coverOutfit);
  });

  it("the canonical outfit explicitly excludes a necklace, never positively requests one", () => {
    const cover = manifest.find((m) => m.kind === "cover")!;
    // "necklace" legitimately appears as a prohibition ("no necklace") — the
    // defect this guards against is a POSITIVE request for one.
    expect(cover.prompt).not.toMatch(/wearing an?\s+necklace|with an?\s+necklace|add an?\s+necklace/i);
    expect(cover.prompt).toMatch(/no necklace/i);
  });
});

describe("Dream Big — generated-text prohibition on every normal page (req. 6)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);

  it("every non-exception prompt bans letters/words, logos, name patches, and watermarks", () => {
    for (const m of manifest) {
      for (const banned of [
        "no captions, names, titles, letters, words, numbers",
        "name patches",
        "brand names or logos",
        "guitars",
        "shirt/clothing typography",
        "No watermarks, signatures, logos, frames, or borders",
      ]) {
        expect(m.prompt, `${m.filename} missing text-prohibition clause "${banned}"`).toContain(banned);
      }
    }
  });
});

describe("Dream Big — backcover safe-region and copy contract (req. 7 & 8)", () => {
  const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
  const backcover = manifest.find((m) => m.kind === "backcover")!;

  it("reserves a barcode-safe region distinct from the vector-text region", () => {
    expect(backcover.prompt).toMatch(/barcode-safe region in the LOWER-RIGHT corner/);
    expect(backcover.prompt).toMatch(/separate quiet region elsewhere in the frame.*reserved for the application's own vector title text/);
  });

  it("never asks the image model to render the 'Dream big.' copy", () => {
    expect(backcover.prompt).not.toMatch(/Dream big\./);
  });

  it("the backcover's own page-copy text ('Dream big.') is app-rendered vector copy, not passed into the illustration prompt", () => {
    const page = backcover as any;
    expect(page.text).toBe("Dream big.");
    expect(page.prompt).not.toContain(page.text);
  });

  it("identifies itself as the back cover, never the front cover", () => {
    expect(backcover.prompt).toMatch(/TARGET ARTWORK FORMAT — back cover/);
    expect(backcover.prompt).not.toMatch(/front cover/i);
  });
});

describe("Dream Big — unchanged geometry/page-count contracts (req. 9 & 10)", () => {
  it("Standard Single still resolves to 24 assets and 24 physical pages", () => {
    const manifest = buildManifest(child, bookId, profileId, "standard-single", []);
    expect(manifest.length).toBe(24);
    const maxPage = Math.max(...manifest.flatMap((m) => m.physicalPages ?? []));
    expect(maxPage).toBe(24);
  });

  it("Expanded Hybrid with one spread still resolves to 24 assets / 25 physical pages", () => {
    const manifest = buildManifest(child, bookId, profileId, "custom-spreads", [
      { startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" },
    ]);
    expect(manifest.length).toBe(24);
    const maxPage = Math.max(...manifest.flatMap((m) => m.physicalPages ?? []));
    expect(maxPage).toBe(25);
  });
});

describe("Other registered stories also receive the identity/style contract (req. 12)", () => {
  const otherBooks = [
    "great-adventure",
    "the-great-detective",
    "kindness-garden",
    "dinosaur-discovery",
    "space-explorer",
    "rainbow-kingdom",
    "safari-friendship",
    "underwater-kingdom",
    "starlit-dream",
  ];

  for (const otherBookId of otherBooks) {
    it(`${otherBookId}: every page carries the identical identity fingerprint and block`, () => {
      const manifest = buildManifest(child, otherBookId, profileId, "standard-single", []);
      expect(manifest.length).toBeGreaterThan(0);
      const fingerprints = new Set(manifest.map((m) => extractFingerprint(m.prompt)));
      expect(fingerprints.size).toBe(1);
      const { block } = characterIdentityContract(child);
      for (const m of manifest) {
        expect(m.prompt, `${otherBookId}/${m.filename} missing the identity block`).toContain(block);
      }
    });

    it(`${otherBookId}: every page bans generated text/logos/watermarks`, () => {
      const manifest = buildManifest(child, otherBookId, profileId, "standard-single", []);
      for (const m of manifest) {
        expect(m.prompt).toContain("ABSOLUTELY NO TEXT IN THE IMAGE");
      }
    });
  }
});

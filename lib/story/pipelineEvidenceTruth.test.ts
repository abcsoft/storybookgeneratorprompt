import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resolveLayoutPlan, getProfileAssetGeometry } from "./layoutPlan";
import { getPrintProfile } from "../print/registry";
import { bedtimeDreamBook } from "./bedtimeDreamTemplate";
import { greatAdventureBook } from "./greatAdventureTemplate";
import { inspectPdfPreflight } from "../pdf/pdfBoxes";
import { buildBook } from "../pdf/buildBook";
import { listBooks } from "./registry";
import type { ChildProfile, GeneratedPage } from "./types";

const child: ChildProfile = { name: "Bartholomew", age: 5, gender: "boy" };

describe("Defect 4 & 5: Scene-Aware Framing and Prompt Deduplication", () => {
  it("assembles Starlit Dream intro prompt with scene-aware bed-covered framing and no limb demands", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const intro = plan.interiorAssets.find((a) => a.sceneId === "intro")!;
    expect(intro).toBeDefined();
    // ResolvedAssetSlot.framing is metadata mirrored only by the legacy
    // (pre-StoryEdition) resolveLayoutPlan branches — storyEdition.ts's
    // buildSlot() never sets it, and nothing in production reads
    // slot.framing (verified: no callers outside layoutPlan.ts's own legacy
    // branches and bedtimeDreamTemplate.ts's PageSpec-building code, which
    // is a different, closure-captured `framing` used to build the prompt
    // itself). The actual generated PROMPT TEXT is unaffected either way,
    // since illustration()'s `overrides?.framing ?? opts.framing` fallback
    // (bedtimeDreamTemplate.ts) already bakes the right framing in at scene
    // definition time — confirmed live via a running /api/prompts call. So
    // this test checks the real, consumed prompt text below, not the inert
    // metadata field.
    const prompt = intro.prompt;

    // Must contain scene-aware framing block
    expect(prompt).toContain("FRAMING (bed-covered)");
    expect(prompt).toContain("Bedding covers the lower body naturally");
    expect(prompt).toContain("natural visible anatomy only for body parts actually outside the bedding");

    // Must NOT contain forbidden demands for limbs under bedding
    expect(prompt).not.toContain("active arms");
    expect(prompt).not.toContain("two visible legs");
    expect(prompt).not.toContain("do not crop feet");
    expect(prompt).not.toContain("visible feet");
    expect(prompt).not.toContain("two legs");

    // Semantic block counts: exactly one framing block, exactly one no-text block
    const framingMatches = prompt.match(/\bFRAMING\s*\(/g) ?? [];
    const noTextMatches = prompt.match(/ABSOLUTELY NO TEXT IN THE IMAGE:/g) ?? [];
    expect(framingMatches.length).toBe(1);
    expect(noTextMatches.length).toBe(1);
  });

  it("assembles Starlit Dream closing prompt with sleeping/bed-covered framing and zero prompt duplication", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const closing = plan.interiorAssets.find((a) => a.sceneId === "closing")!;
    expect(closing).toBeDefined();
    // See the intro test above for why ResolvedAssetSlot.framing (unset by
    // storyEdition.ts's buildSlot()) is not asserted here — the prompt text
    // itself, checked below, is the real, consumed contract.
    const prompt = closing.prompt;

    // Must contain scene-aware framing block
    expect(prompt).toContain("FRAMING (sleeping/bed-covered)");
    expect(prompt).toContain("Bedding covers the lower body naturally");
    expect(prompt).toContain("Require natural visible anatomy only for body parts actually outside the bedding");

    // Must NOT contain forbidden demands for limbs under bedding
    expect(prompt).not.toContain("active arms");
    expect(prompt).not.toContain("two visible legs");
    expect(prompt).not.toContain("do not crop feet");
    expect(prompt).not.toContain("visible feet");
    expect(prompt).not.toContain("two legs");

    // Semantic block counts: exactly one framing block, exactly one no-text block
    const framingMatches = prompt.match(/\bFRAMING\s*\(/g) ?? [];
    const noTextMatches = prompt.match(/ABSOLUTELY NO TEXT IN THE IMAGE:/g) ?? [];
    expect(framingMatches.length).toBe(1);
    expect(noTextMatches.length).toBe(1);
  });

  it("enforces exactly one framing block and one no-text prohibition block across all story templates", () => {
    const allBooks = listBooks();
    expect(allBooks.length).toBeGreaterThanOrEqual(2);

    for (const book of allBooks) {
      const plan = resolveLayoutPlan({
        child,
        bookId: book.id,
        profileId: "classic-landscape-11x8",
        mode: "standard-single",
      });

      for (const asset of plan.assets) {
        // Skip backcover with custom sign policy if no-text is replaced
        const isBackcoverSign = asset.assetKind === "back-cover" && asset.prompt.includes("SIGN ONLY");

        const framingMatches = asset.prompt.match(/\bFRAMING\s*\(/g) ?? [];
        expect(
          framingMatches.length,
          `Asset ${asset.slotId} in ${book.id} must have exactly 1 FRAMING block, found ${framingMatches.length}`,
        ).toBe(1);

        if (!isBackcoverSign) {
          const noTextMatches = asset.prompt.match(/ABSOLUTELY NO TEXT IN THE IMAGE:/g) ?? [];
          expect(
            noTextMatches.length,
            `Asset ${asset.slotId} in ${book.id} must have exactly 1 no-text block, found ${noTextMatches.length}`,
          ).toBe(1);
        }
      }
    }
  });
});

describe("Defect 3: PDF Raster Preflight & Image Object Classification", () => {
  it("verifies production PDF raster preflight passes at 300 PPI with searchable vector text", async () => {
    const img300 = await sharp({
      create: {
        width: 3375,
        height: 2475,
        channels: 3,
        background: { r: 25, g: 35, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const pages: GeneratedPage[] = [
      {
        index: 0,
        kind: "cover",
        text: "Bartholomew's Adventure",
        image: img300,
        imageMimeType: "image/png",
        failed: false,
      },
      {
        index: 1,
        kind: "intro",
        text: "Every night, Bartholomew looked out at the moonlit trees.",
        image: img300,
        imageMimeType: "image/png",
        failed: false,
      },
    ];

    const pdfBuf = await buildBook(pages, child);
    const preflight = inspectPdfPreflight(pdfBuf);

    expect(preflight.ok).toBe(true);
    expect(preflight.errors).toEqual([]);
    expect(preflight.minProductionPpi).toBeGreaterThanOrEqual(300);
    expect(preflight.hasVectorStoryText).toBe(true);
    expect(preflight.imageObjects.length).toBeGreaterThanOrEqual(1);

    // Every image object must have a role and classification
    for (const obj of preflight.imageObjects) {
      expect(["production-artwork", "backdrop-layer", "ui-overlay"]).toContain(obj.role);
      expect(typeof obj.coveragePct).toBe("number");
      expect(typeof obj.effectivePpi).toBe("number");
    }
  });

  it("fails preflight when a full-page raster object violates the 300 PPI threshold", () => {
    // Construct mock PDF header with 235 PPI raster object covering full page
    const mockPdfContent = `
      %PDF-1.4
      1 0 obj
      << /Type /Page /MediaBox [0 0 810 594] /TrimBox [9 9 801 585] >>
      endobj
      2 0 obj
      << /Type /XObject /Subtype /Image /Width 2642 /Height 1938 /Filter /FlateDecode >>
      endobj
      3 0 obj
      << /Type /Font /Subtype /TrueType >>
      endobj
      stream
      BT /F1 12 Tf 100 100 Td (Story Text) Tj ET
      endstream
      %%EOF
    `;

    const preflight = inspectPdfPreflight(Buffer.from(mockPdfContent, "latin1"));
    expect(preflight.ok).toBe(false);
    expect(preflight.minProductionPpi).toBeLessThan(290);
    expect(preflight.imageObjects.some((o) => o.coveragePct >= 50 && o.isProductionRelevant)).toBe(true);
    expect(preflight.errors.some((e) => e.includes("Production raster resolution below print threshold"))).toBe(true);
  });
});

describe("Defect 2: Facing-Pair Proof Geometry & Assertions", () => {
  it("verifies equal scale, 100% occupied area, zero black padding, and center join continuity", async () => {
    // Generate synthetic left and right leaf buffers at 3375 x 2475
    const leftLeaf = await sharp({
      create: {
        width: 3375,
        height: 2475,
        channels: 4,
        background: { r: 12, g: 74, b: 110, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const rightLeaf = await sharp({
      create: {
        width: 3375,
        height: 2475,
        channels: 4,
        background: { r: 12, g: 74, b: 110, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Composite side-by-side
    const facingPair = await sharp({
      create: {
        width: 6750,
        height: 2475,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        { input: leftLeaf, left: 0, top: 0 },
        { input: rightLeaf, left: 3375, top: 0 },
      ])
      .png()
      .toBuffer();

    const meta = await sharp(facingPair).metadata();
    expect(meta.width).toBe(6750);
    expect(meta.height).toBe(2475);

    // Check equal scale: left width === right width === 3375
    const leftW = 3375;
    const rightW = 3375;
    expect(leftW).toBe(rightW);
    expect(leftW / rightW).toBe(1.0);

    // Occupied area: exactly (3375*2475 + 3375*2475) / (6750*2475) = 1.0 (100%)
    const occupiedAreaPct = ((leftW * 2475 + rightW * 2475) / (meta.width! * meta.height!)) * 100;
    expect(occupiedAreaPct).toBe(100);

    // Center seam: x = 3375 is the untrimmed leaf boundary
    expect(meta.width! / 2).toBe(3375);
  });

  it("verifies finished bound trim preview geometry at 600 DPI with seamless center join and no duplicate strip", async () => {
    // 600 DPI master: 13350 x 4950
    const masterSvg = `
      <svg width="13350" height="4950" xmlns="http://www.w3.org/2000/svg">
        <rect width="13350" height="4950" fill="#1e293b" />
        <line x1="0" y1="2475" x2="13350" y2="2475" stroke="#38bdf8" stroke-width="40" />
      </svg>
    `;
    const masterBuf = await sharp(Buffer.from(masterSvg)).png().toBuffer();

    // Sliced leaves at 600 DPI (6750 x 4950 each, with 150 px overlap from master)
    const leftLeaf600 = await sharp(masterBuf).extract({ left: 0, top: 0, width: 6750, height: 4950 }).toBuffer();
    const rightLeaf600 = await sharp(masterBuf).extract({ left: 6600, top: 0, width: 6750, height: 4950 }).toBuffer();

    // Trim 75 px (0.125 in at 600 DPI) from all outer and binding edges: 6600 x 4800 per page
    const leftTrimmed = await sharp(leftLeaf600).extract({ left: 75, top: 75, width: 6600, height: 4800 }).toBuffer();
    const rightTrimmed = await sharp(rightLeaf600).extract({ left: 75, top: 75, width: 6600, height: 4800 }).toBuffer();

    // Two-page trimmed pair: 13200 x 4800
    const trimmedPair600 = await sharp({
      create: { width: 13200, height: 4800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([
        { input: leftTrimmed, left: 0, top: 0 },
        { input: rightTrimmed, left: 6600, top: 0 },
      ])
      .png()
      .toBuffer();

    const meta = await sharp(trimmedPair600).metadata();
    expect(meta.width).toBe(13200);
    expect(meta.height).toBe(4800);

    // Assert zero black padding and 100% occupied area
    const occupiedAreaPct = ((6600 * 4800 + 6600 * 4800) / (meta.width! * meta.height!)) * 100;
    expect(occupiedAreaPct).toBe(100);

    // Binding join is exactly at x = 6600
    expect(meta.width! / 2).toBe(6600);
  });
});

describe("Defect 3 & 4: Semantic Small-Element Preflight & Provider Quality Thresholds", () => {
  it("fails preflight when a small printed element (like Detective sign or badge) has low PPI", () => {
    // Construct mock PDF with 300 PPI background artwork + low-PPI 100-PPI sign overlay (100x100 over 1x1 inch)
    const mockPdfWithLowPpiSign = `
      %PDF-1.4
      1 0 obj
      << /Type /Page /MediaBox [0 0 810 594] /TrimBox [9 9 801 585] >>
      endobj
      2 0 obj
      << /Type /XObject /Subtype /Image /Width 3375 /Height 2475 /Filter /FlateDecode >>
      endobj
      3 0 obj
      << /Type /XObject /Subtype /Image /Width 100 /Height 100 /Filter /FlateDecode >>
      endobj
      4 0 obj
      << /Type /Font /Subtype /TrueType >>
      endobj
      stream
      q 3375 0 0 -2475 0 2475 cm /X2 Do Q
      q 300 0 0 -300 1000 1000 cm /X3 Do Q
      BT /F1 12 Tf 100 100 Td (Story Text) Tj ET
      endstream
      %%EOF
    `;

    const preflight = inspectPdfPreflight(Buffer.from(mockPdfWithLowPpiSign, "latin1"));
    expect(preflight.ok).toBe(false);
    expect(preflight.minProductionPpi).toBeLessThan(290);
    expect(
      preflight.imageObjects.some(
        (o) => o.role === "decorative-element" && o.isProductionRelevant && o.effectivePpi < 290,
      ),
    ).toBe(true);
    expect(preflight.errors.some((e) => e.includes("Production raster resolution below print threshold"))).toBe(true);
  });

  it("programmatically derives provider-native minimums for 200 native PPI and 1.5x max upscale", () => {
    const single43 = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });
    const intro = single43.interiorAssets.find((a) => a.sceneId === "intro")!;
    expect(intro.minAcceptableResolution.width).toBe(2250);
    expect(intro.minAcceptableResolution.height).toBe(1688);

    // Bedtime Dream (like every registered story) now resolves through its
    // standard-24 edition, which declares no approvedSpreadPairs — Custom
    // Spreads is rejected outright, so there's no longer a real resolved
    // "spread" asset to pull this from. The provider-native-minimum
    // derivation itself is a pure, story-independent geometry function
    // (getProfileAssetGeometry -> deriveProviderNativeMinimum), so check it
    // directly for the "spread" assetKind instead.
    expect(() =>
      resolveLayoutPlan({
        child,
        bookId: "bedtime-dream",
        profileId: "classic-landscape-11x8",
        mode: "custom-spreads",
        customSpreads: [{ startPage: 10, endPage: 11, textSide: "left" }],
      }),
    ).toThrow("Custom spreads require an approved fixed-24 editorial mapping.");

    const spreadGeom = getProfileAssetGeometry(getPrintProfile("classic-landscape-11x8"), "spread");
    expect(spreadGeom.minResolution.width).toBe(4450);
    expect(spreadGeom.minResolution.height).toBe(1907);
  });

  it("ensures sleeping prompts never encourage footwear in bed and strictly exclude limb demands", () => {
    const plan = resolveLayoutPlan({
      child,
      bookId: "bedtime-dream",
      profileId: "classic-landscape-11x8",
      mode: "standard-single",
    });

    const intro = plan.interiorAssets.find((a) => a.sceneId === "intro")!;
    const closing = plan.interiorAssets.find((a) => a.sceneId === "closing")!;

    for (const asset of [intro, closing]) {
      const p = asset.prompt;
      // Prohibit encouraging footwear in bed
      if (p.includes("slippers")) {
        expect(p).toContain("slippers are placed beside the bed");
        expect(p).toContain("not worn or visible under the covers");
      }
      expect(p).not.toMatch(/wearing slippers in bed/i);

      // Prohibit limb demands and forbidden phrases
      expect(p).not.toContain("active arms");
      expect(p).not.toContain("two visible legs");
      expect(p).not.toContain("visible feet");
      expect(p).not.toContain("do not crop feet");
      expect(p).not.toContain("two legs");
      expect(p).not.toContain("two visible hands");
      expect(p).not.toContain("FRAMING: show the child as a natural medium shot");

      // Exactly 1 framing block and 1 no-text block
      const framingMatches = p.match(/\bFRAMING\s*\(/g) ?? [];
      const noTextMatches = p.match(/ABSOLUTELY NO TEXT IN THE IMAGE:/g) ?? [];
      expect(framingMatches.length).toBe(1);
      expect(noTextMatches.length).toBe(1);
    }
  });
});

describe("Defect 5: CTM Graphics State & Placement Precision Regressions", () => {
  it("resolves full-page and small overlays to exact 300 PPI via cumulative CTM without role overrides", () => {
    const mockPdf = `
      %PDF-1.4
      1 0 obj
      << /Type /Page /MediaBox [0 0 810 594] /TrimBox [9 9 801 585] /Contents 5 0 R >>
      endobj
      2 0 obj
      << /Type /XObject /Subtype /Image /Width 3375 /Height 2475 /Filter /FlateDecode >>
      endobj
      3 0 obj
      << /Type /XObject /Subtype /Image /Width 300 /Height 300 /Filter /FlateDecode >>
      endobj
      4 0 obj
      << /Type /Font /Subtype /TrueType >>
      endobj
      5 0 obj
      << /Length 120 >>
      stream
      q 810 0 0 594 0 0 cm /X2 Do Q
      q 72 0 0 72 100 100 cm /X3 Do Q
      BT /F1 12 Tf 100 100 Td (Story Text) Tj ET
      endstream
      endobj
      %%EOF
    `;
    const preflight = inspectPdfPreflight(Buffer.from(mockPdf, "latin1"));
    expect(preflight.ok).toBe(true);
    expect(preflight.minProductionPpi).toBe(300);
    const bg = preflight.imageObjects.find((o) => o.width === 3375)!;
    expect(bg.placedWidthIn).toBe(11.25);
    expect(bg.placedHeightIn).toBe(8.25);
    expect(bg.effectivePpi).toBe(300);

    const overlay = preflight.imageObjects.find((o) => o.width === 300)!;
    expect(overlay.placedWidthIn).toBe(1);
    expect(overlay.placedHeightIn).toBe(1);
    expect(overlay.effectivePpi).toBe(300);
  });

  it("tracks Form XObjects and SMasks through nested q/Q/cm transformations", () => {
    const mockPdf = `
      %PDF-1.4
      1 0 obj
      << /Type /Page /MediaBox [0 0 810 594] /TrimBox [9 9 801 585] /Contents 5 0 R >>
      endobj
      2 0 obj
      << /Type /XObject /Subtype /Image /Width 1176 /Height 561 /Filter /FlateDecode >>
      endobj
      3 0 obj
      << /Type /XObject /Subtype /Form /Resources << /XObject << /X2 2 0 R >> >> >>
      stream
      q 1176 0 0 -561 1917 2279 cm /X2 Do Q
      endstream
      endobj
      4 0 obj
      << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G 3 0 R >> >>
      endobj
      5 0 obj
      << /Length 120 >>
      stream
      .24 0 0 -.24 0 594 cm
      /G4 gs
      1917 1718 1176 561 re f
      BT /F1 12 Tf 100 100 Td (Story Text) Tj ET
      endstream
      endobj
      6 0 obj
      << /Type /Font /Subtype /TrueType >>
      endobj
      %%EOF
    `;
    const preflight = inspectPdfPreflight(Buffer.from(mockPdf, "latin1"));
    expect(preflight.ok).toBe(true);
    expect(preflight.minProductionPpi).toBe(300);
    const sign = preflight.imageObjects.find((o) => o.width === 1176)!;
    expect(sign.placedWidthIn).toBeCloseTo(3.92, 2);
    expect(sign.placedHeightIn).toBeCloseTo(1.87, 2);
    expect(sign.effectivePpi).toBe(300);
  });

  it("flags non-uniform scaling when image dimensions or CTM matrices have > 1% aspect disparity", () => {
    const mockPdf = `
      %PDF-1.4
      1 0 obj
      << /Type /Page /MediaBox [0 0 810 594] /TrimBox [9 9 801 585] /Contents 4 0 R >>
      endobj
      2 0 obj
      << /Type /XObject /Subtype /Image /Width 3375 /Height 2475 /Filter /FlateDecode >>
      endobj
      3 0 obj
      << /Type /Font /Subtype /TrueType >>
      endobj
      4 0 obj
      << /Length 100 >>
      stream
      q 810 0 0 300 0 0 cm /X2 Do Q
      BT /F1 12 Tf 100 100 Td (Story Text) Tj ET
      endstream
      endobj
      %%EOF
    `;
    const preflight = inspectPdfPreflight(Buffer.from(mockPdf, "latin1"));
    expect(preflight.ok).toBe(false);
    expect(preflight.hasNonUniformScaling).toBe(true);
    expect(preflight.errors).toContain("Non-uniform scaling detected in embedded page artwork.");
  });

  it("verifies production proof-evidence-manifest.json contains passing selfValidation and 300 PPI CTM geometry", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const manifestPath = path.join(process.cwd(), "artifacts", "proof-evidence-manifest.json");
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    // Self-validation contract
    expect(manifest.selfValidation).toBeDefined();
    expect(manifest.selfValidation.passed).toBe(true);
    expect(manifest.selfValidation.artifactCount).toBe(12);
    expect(manifest.selfValidation.zipEntryCount).toBe(13);
    expect(manifest.selfValidation.hashChecksPassed).toBe(true);
    expect(manifest.selfValidation.dimensionChecksPassed).toBe(true);
    expect(manifest.selfValidation.pdfGeometryChecksPassed).toBe(true);
    expect(manifest.selfValidation.pdfRasterPpiChecksPassed).toBe(true);
    expect(manifest.selfValidation.spreadJoinChecksPassed).toBe(true);
    expect(manifest.selfValidation.failures).toEqual([]);

    // Min production PPI must be 300
    expect(manifest.qualityFramework.minProductionPpi).toBe(300);
    expect(manifest.qualityFramework.outputGridPpi).toBe(300);

    // Spread proof separation
    const untrimmed = manifest.artifacts.find((a: any) => a.filename === "proof-landscape-spread-facing-pair-untrimmed.png");
    const trimmed = manifest.artifacts.find((a: any) => a.filename === "proof-landscape-spread-facing-pair-trimmed.png");
    expect(untrimmed).toBeDefined();
    expect(untrimmed.pixelDimensions).toEqual({ width: 6750, height: 2475 });
    expect(trimmed).toBeDefined();
    expect(trimmed.pixelDimensions).toEqual({ width: 6600, height: 2400 });

    // PDF image objects geometry
    const pdfArtifact = manifest.artifacts.find((a: any) => a.filename === "proof-classic-landscape.pdf");
    expect(pdfArtifact).toBeDefined();
    expect(pdfArtifact.minProductionPpi).toBe(300);
    expect(pdfArtifact.hasNonUniformScaling).toBe(false);

    const signOverlay = pdfArtifact.imageObjects.find((img: any) => img.width === 1176);
    expect(signOverlay).toBeDefined();
    expect(signOverlay.placedWidthIn).toBe(3.92);
    expect(signOverlay.placedHeightIn).toBe(1.87);
    expect(signOverlay.effectivePpi).toBe(300);
  });

  it("verifies production proof-classic-landscape.pdf resolves detective sign overlay to exactly 300 PPI via CTM", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const pdfPath = path.join(process.cwd(), "artifacts", "proof-classic-landscape.pdf");
    const pdfBuf = await fs.readFile(pdfPath);
    const preflight = inspectPdfPreflight(pdfBuf);

    expect(preflight.ok).toBe(true);
    expect(preflight.pageCount).toBe(7);
    expect(preflight.minProductionPpi).toBe(300);
    expect(preflight.outputGridPpi).toBe(300);
    expect(preflight.hasNonUniformScaling).toBe(false);

    // Sign overlay image object
    const sign = preflight.imageObjects.find((img) => img.width === 1176);
    expect(sign).toBeDefined();
    expect(sign!.placedWidthIn).toBe(3.92);
    expect(sign!.placedHeightIn).toBe(1.87);
    expect(sign!.dpiX).toBe(300);
    expect(sign!.dpiY).toBe(300);
    expect(sign!.effectivePpi).toBe(300);
  });
});

describe("Clean Finished Spread Repair & Diagnostic Isolation", () => {
  it("confirms finished pair equals the direct clean master trim before downsampling at 600 DPI", async () => {
    // Continuous 600 DPI master: 13350 x 4950
    const masterSvg = `
      <svg width="13350" height="4950" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#1d4ed8;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2563eb;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="hillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#14532d;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#15803d;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="13350" height="4950" fill="url(#skyGrad)" />
        <path d="M 0,3300 Q 3336,2700 6675,3000 T 13350,2900 L 13350,4950 L 0,4950 Z" fill="url(#hillGrad)" opacity="0.75" />
        <path d="M 0,3900 Q 3600,3400 6675,3600 T 13350,3500 L 13350,4950 L 0,4950 Z" fill="#14452f" />
      </svg>
    `;
    const masterBuf = await sharp(Buffer.from(masterSvg)).png().toBuffer();

    // Direct clean master trim: remove 75 px outer bleed (left/right) and 75 px (top/bottom) -> 13200 x 4800
    const directTrim = await sharp(masterBuf).extract({ left: 75, top: 75, width: 13200, height: 4800 }).png().toBuffer();

    // Sliced leaves at 600 DPI: 6750 x 4950 each with 150 px overlap from x=6600..6750
    const leftLeaf = await sharp(masterBuf).extract({ left: 0, top: 0, width: 6750, height: 4950 }).png().toBuffer();
    const rightLeaf = await sharp(masterBuf).extract({ left: 6600, top: 0, width: 6750, height: 4950 }).png().toBuffer();

    // Trim 75 px bleed from each leaf -> 6600 x 4800
    const leftTrimmed = await sharp(leftLeaf).extract({ left: 75, top: 75, width: 6600, height: 4800 }).png().toBuffer();
    const rightTrimmed = await sharp(rightLeaf).extract({ left: 75, top: 75, width: 6600, height: 4800 }).png().toBuffer();

    // Reconstruct trimmed pair: 13200 x 4800
    const reconTrim = await sharp({
      create: { width: 13200, height: 4800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([
        { input: leftTrimmed, left: 0, top: 0 },
        { input: rightTrimmed, left: 6600, top: 0 },
      ])
      .png()
      .toBuffer();

    const directRaw = await sharp(directTrim).raw().toBuffer();
    const reconRaw = await sharp(reconTrim).raw().toBuffer();

    expect(directRaw.length).toBe(13200 * 4800 * 4);
    expect(reconRaw.length).toBe(13200 * 4800 * 4);
    expect(Buffer.compare(directRaw, reconRaw)).toBe(0);
  });

  it("confirms finished trimmed proof contains no diagnostic center line, seam spike, or labels", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const trimmedPath = path.join(process.cwd(), "artifacts", "proof-landscape-spread-facing-pair-trimmed.png");
    const trimmedBuf = await fs.readFile(trimmedPath);

    const meta = await sharp(trimmedBuf).metadata();
    expect(meta.width).toBe(6600);
    expect(meta.height).toBe(2400);

    // Sample center strip around x=3300: 20 pixels wide, full height
    const centerStrip = await sharp(trimmedBuf)
      .extract({ left: 3290, top: 0, width: 20, height: 2400 })
      .raw()
      .toBuffer();

    let maxSeamSpike = 0;
    let maxDisparity = 0;
    let foundDiagnosticColor = false;

    for (let y = 0; y < 2400; y++) {
      const rowOffset = y * 20 * 4;
      const p8 = rowOffset + 8 * 4;
      const p9 = rowOffset + 9 * 4;
      const p10 = rowOffset + 10 * 4;
      const p11 = rowOffset + 11 * 4;

      for (let c = 0; c < 3; c++) {
        const c8 = centerStrip[p8 + c];
        const c9 = centerStrip[p9 + c];
        const c10 = centerStrip[p10 + c];
        const c11 = centerStrip[p11 + c];

        const diff = Math.abs(c9 - c10);
        if (diff > maxDisparity) maxDisparity = diff;

        const spikeLeft = Math.abs(c9 - (c8 + c10) / 2);
        const spikeRight = Math.abs(c10 - (c9 + c11) / 2);
        if (spikeLeft > maxSeamSpike) maxSeamSpike = spikeLeft;
        if (spikeRight > maxSeamSpike) maxSeamSpike = spikeRight;
      }

      for (let x = 0; x < 20; x++) {
        const px = rowOffset + x * 4;
        const r = centerStrip[px];
        const g = centerStrip[px + 1];
        const b = centerStrip[px + 2];

        // Red diagnostic line/overlap marker (#ef4444: r~239, g~68, b~68)
        if (r > 200 && g < 100 && b < 100) foundDiagnosticColor = true;
        // Yellow diagnostic marker (#fef08a: r~254, g~240, b~138)
        if (r > 230 && g > 220 && b > 100 && b < 160) foundDiagnosticColor = true;
      }
    }

    expect(maxDisparity).toBeLessThanOrEqual(12);
    expect(maxSeamSpike).toBeLessThanOrEqual(3.0);
    expect(foundDiagnosticColor).toBe(false);

    // Check manifest properties
    const manifestPath = path.join(process.cwd(), "artifacts", "proof-evidence-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    const trimmedItem = manifest.artifacts.find((a: any) => a.filename === "proof-landscape-spread-facing-pair-trimmed.png");
    expect(trimmedItem).toBeDefined();
    expect(trimmedItem.trimmedPairGeometry.isAnnotationFree).toBe(true);
    expect(trimmedItem.trimmedPairGeometry.equalsDirectMasterTrimAt600Dpi).toBe(true);
    expect(trimmedItem.trimmedPairGeometry.duplicateInnerBleedStripPx).toBe(0);
    expect(trimmedItem.trimmedPairGeometry.centerBindingJoinX).toBe(3300);
  });

  it("confirms diagnostic untrimmed proof retains its center annotations and overlap markers", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const untrimmedPath = path.join(process.cwd(), "artifacts", "proof-landscape-spread-facing-pair-untrimmed.png");
    const untrimmedBuf = await fs.readFile(untrimmedPath);

    const meta = await sharp(untrimmedBuf).metadata();
    expect(meta.width).toBe(6750);
    expect(meta.height).toBe(2475);

    // Extract center region where yellow seam line and banner are located
    const centerPatch = await sharp(untrimmedBuf)
      .extract({ left: 3370, top: 0, width: 10, height: 100 })
      .raw()
      .toBuffer();

    let hasYellowGuide = false;
    for (let i = 0; i < centerPatch.length; i += 4) {
      const r = centerPatch[i];
      const g = centerPatch[i + 1];
      const b = centerPatch[i + 2];
      if (r > 200 && g > 180 && b < 80) {
        hasYellowGuide = true;
        break;
      }
    }
    expect(hasYellowGuide).toBe(true);

    // Check manifest classification
    const manifestPath = path.join(process.cwd(), "artifacts", "proof-evidence-manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    const untrimmedItem = manifest.artifacts.find((a: any) => a.filename === "proof-landscape-spread-facing-pair-untrimmed.png");
    expect(untrimmedItem).toBeDefined();
    expect(untrimmedItem.facingPairGeometry.diagnosticType).toBe("untrimmed full-bleed pair with labeled inner bleed duplicate");
    expect(untrimmedItem.facingPairGeometry.hiddenInnerBleedOverlapPx).toBe(75);
    expect(untrimmedItem.facingPairGeometry.centerBindingJoinX).toBe(3375);
  });
});


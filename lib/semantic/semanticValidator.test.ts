import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateStoryMatch } from "./semanticValidator";

describe("Semantic Story/Image Validation", () => {
  // Regression Test 9:
  // Semantic mismatch is independent of filename/slot matching
  it("9. Semantic mismatch is independent of filename/slot matching", async () => {
    // A buffer with embedded inventor keywords but given the exact filename matching the veterinarian slot
    const fixturePath = path.resolve(process.cwd(), "test-fixtures/semantic/21-veterinarian.png");
    const imageBuffer = fs.readFileSync(fixturePath);

    const result = await validateStoryMatch({
      slotId: "slot-21",
      filename: "21-veterinarian.png", // exact slot filename match
      roleSlug: "veterinarian",
      expectedRole: "veterinarian caring for animals",
      storyText: "Alex carefully examines the puppy with a stethoscope, making sure all the animals are healthy and happy.",
      prompt: "Alex as a gentle veterinarian wearing scrubs and examining a cute golden puppy in a brightly lit animal clinic.",
      imageBuffer,
      mimeType: "image/png",
      otherSlots: [
        { slotId: "slot-22", roleSlug: "inventor", role: "inventor building machines" },
        { slotId: "slot-23", roleSlug: "pilot", role: "airplane pilot" },
      ],
    });

    // Despite exact filename matching '21-veterinarian.png', semantic validation catches the mismatch
    expect(result.status).toBe("POSSIBLE_MISMATCH");
    expect(result.expectedRole).toContain("veterinarian");
    expect(result.detectedContent).toContain("Inventor workshop with gears");
    expect(result.explanation).toContain("contradicts the expected role");
    expect(result.candidateSwapSlotId).toBe("slot-22");
  });

  // Regression Test 10:
  // The veterinarian/inventor negative fixture is flagged
  it("10. The veterinarian/inventor negative fixture is flagged as POSSIBLE_MISMATCH", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-fixtures/semantic/21-veterinarian.png");
    expect(fs.existsSync(fixturePath)).toBe(true);

    const imageBuffer = fs.readFileSync(fixturePath);

    const result = await validateStoryMatch({
      slotId: "21-veterinarian",
      filename: "21-veterinarian.png",
      roleSlug: "veterinarian",
      expectedRole: "veterinarian",
      storyText: "Alex helps animals feel better at the clinic.",
      prompt: "Alex the veterinarian with animals.",
      imageBuffer,
      mimeType: "image/png",
    });

    expect(result.status).toBe("POSSIBLE_MISMATCH");
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.detectedContent.toLowerCase()).toContain("inventor");
    expect(result.detectedContent.toLowerCase()).toContain("gears");
  });

  // Test matching case
  it("reports MATCH for an illustration aligned with the narrative", async () => {
    // Regular buffer without conflicting keywords
    const fixturePath = path.resolve(process.cwd(), "test-fixtures/semantic/21-veterinarian.png");
    const imageBuffer = fs.readFileSync(fixturePath);

    // If the expected role IS inventor, this should match!
    const result = await validateStoryMatch({
      slotId: "slot-22",
      filename: "22-inventor.png",
      roleSlug: "inventor",
      expectedRole: "inventor building machines",
      storyText: "Alex designs marvelous inventions in the workshop.",
      prompt: "Alex as an inventor with gears and blueprints.",
      imageBuffer,
      mimeType: "image/png",
    });

    expect(result.status).toBe("MATCH");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

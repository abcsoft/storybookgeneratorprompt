import { describe, expect, it } from "vitest";
import { DEFAULT_PRINT_PROFILE_ID, getPrintProfile, listPrintProfiles } from "./registry";

describe("print registry", () => {
  it("lists both the landscape and Printify profiles", () => {
    const profiles = listPrintProfiles();
    expect(profiles.some((p) => p.id === "classic-landscape-11x8")).toBe(true);
    expect(profiles.some((p) => p.id === "printify-hardcover-square-8x8")).toBe(true);
  });

  it("resolves the default profile when no id is given", () => {
    expect(getPrintProfile().id).toBe(DEFAULT_PRINT_PROFILE_ID);
    expect(DEFAULT_PRINT_PROFILE_ID).toBe("classic-landscape-11x8");
  });

  it("falls back to the default for an unknown id", () => {
    expect(getPrintProfile("does-not-exist").id).toBe(DEFAULT_PRINT_PROFILE_ID);
  });

  it("gives the Printify profile the exact production template measurements", () => {
    const profile = getPrintProfile("printify-hardcover-square-8x8");
    expect(profile.canvasPx).toEqual({ width: 2400, height: 2400 });
    expect(profile.finishedAreaPx).toEqual({ width: 2325, height: 2325 });
    expect(profile.safeAreaPx).toEqual({ width: 2175, height: 2250 });
    expect(profile.coverGeometryPx).toEqual({ width: 5370, height: 2850 });
    expect(profile.dpi).toBe(300);
    expect(profile.exportMode).toBe("printify-folder");
  });

  it("keeps the landscape profile on the single-pdf export path", () => {
    const profile = getPrintProfile("classic-landscape-11x8");
    expect(profile.exportMode).toBe("single-pdf");
    // 4:3 (1.333) is the mathematically closest provider preset to the
    // 3375x2475 (15:11 = 1.364) target canvas — 3:2 (1.5) is 10% off vs 4:3's
    // 2.2%. singleAspect must match providerPresetAspect so the UI heading
    // never contradicts the prompt body's own aspect-preset claim.
    expect(profile.singleAspect).toBe("4:3");
    expect(profile.singleAspect).toBe(profile.providerPresetAspect);
    expect(profile.spreadAspect).toBe("21:9");
  });
});

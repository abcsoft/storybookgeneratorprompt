import { describe, expect, it } from "vitest";
import { matchImportedFiles } from "./importMatch";

const required = Array.from({ length: 21 }, (_, i) => `${String(i + 1).padStart(2, "0")}.png`);

describe("matchImportedFiles", () => {
  it("reports a clean, complete import", () => {
    const report = matchImportedFiles(required, required);
    expect(report.required).toBe(21);
    expect(report.matched).toBe(21);
    expect(report.missing).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.unmatched).toEqual([]);
    expect(report.byIndex.get(0)).toBe("01.png");
  });

  it("lists exact missing filenames for a partial import", () => {
    const provided = required.slice(0, 19); // 19 of 21
    const report = matchImportedFiles(provided, required);
    expect(report.matched).toBe(19);
    expect(report.missing).toEqual(["20.png", "21.png"]);
  });

  it("flags a second file resolving to an already-claimed page as a duplicate", () => {
    const provided = [...required, "page-1.png"]; // also resolves to index 0
    const report = matchImportedFiles(provided, required);
    expect(report.duplicates).toEqual([
      { filename: "page-1.png", index: 0, claimedBy: "01.png" },
    ]);
    expect(report.matched).toBe(21); // duplicate doesn't inflate the match count
  });

  it("flags the exact same filename selected twice as a duplicate", () => {
    const report = matchImportedFiles(["01.png", "01.png"], required);
    expect(report.duplicates).toEqual([
      { filename: "01.png", index: 0, claimedBy: "01.png" },
    ]);
  });

  it("reports filenames that don't match any page as unmatched, not silently dropped", () => {
    const report = matchImportedFiles(["cover-final.png", "00.png"], required);
    expect(report.unmatched).toEqual(["cover-final.png", "00.png"]);
    expect(report.missing.length).toBe(21);
  });

  it("does not let an out-of-range page number silently overwrite an in-range one", () => {
    const report = matchImportedFiles(["99.png"], required);
    expect(report.unmatched).toEqual(["99.png"]);
    expect(report.byIndex.size).toBe(0);
  });

  it("matches the exact 'Required/Matched/Missing/Duplicates/Unmatched' shape from the spec", () => {
    const provided = [
      ...required.slice(0, 19), // 19 matched
      "page-1.png", // duplicate of 01.png
      "notes.png", // unmatched
    ];
    const report = matchImportedFiles(provided, required);
    expect(report.required).toBe(21);
    expect(report.matched).toBe(19);
    expect(report.missing).toEqual(["20.png", "21.png"]);
    expect(report.duplicates.length).toBe(1);
    expect(report.unmatched).toEqual(["notes.png"]);
  });
});

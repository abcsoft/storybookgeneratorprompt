import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { uniquePath } from "./paths";

const tmps: string[] = [];
function freshTmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), "paths-test-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("uniquePath", () => {
  it("returns the desired path when nothing exists there", () => {
    const base = freshTmp();
    const want = path.join(base, "alex");
    expect(uniquePath(want)).toBe(want);
  });

  it("appends _1, _2 … for a clashing directory", () => {
    const base = freshTmp();
    mkdirSync(path.join(base, "alex"));
    expect(uniquePath(path.join(base, "alex"))).toBe(path.join(base, "alex_1"));

    mkdirSync(path.join(base, "alex_1"));
    expect(uniquePath(path.join(base, "alex"))).toBe(path.join(base, "alex_2"));
  });

  it("inserts the suffix before the extension for a clashing file", () => {
    const base = freshTmp();
    writeFileSync(path.join(base, "book-dream-big.pdf"), "x");
    expect(uniquePath(path.join(base, "book-dream-big.pdf"))).toBe(
      path.join(base, "book-dream-big_1.pdf"),
    );
  });
});

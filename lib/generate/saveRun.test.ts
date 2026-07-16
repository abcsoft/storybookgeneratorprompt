import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveRun } from "./saveRun";

const original = process.env.STORYBOOK_OUT_DIR;

afterEach(() => {
  if (original === undefined) delete process.env.STORYBOOK_OUT_DIR;
  else process.env.STORYBOOK_OUT_DIR = original;
});

describe("saveRun", () => {
  it("writes a per-child folder with images, anchor, prompts, and pdf", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "sbtest-"));
    process.env.STORYBOOK_OUT_DIR = base;

    const dir = await saveRun({
      child: { name: "Alex", age: 1, gender: "boy" },
      bookId: "dream-big",
      anchor: { data: Buffer.from("anchor"), mimeType: "image/png" },
      pdf: Buffer.from("%PDF-fake"),
      images: [
        { index: 0, data: Buffer.from("img0"), mimeType: "image/png" },
        { index: 2, data: Buffer.from("img2"), mimeType: "image/jpeg" },
      ],
    });

    const files = (await readdir(dir)).sort();
    expect(files).toContain("prompts.md");
    expect(files).toContain("00-character.png");
    expect(files).toContain("01.png"); // index 0 -> 01
    expect(files).toContain("03.jpg"); // index 2 (jpeg) -> 03.jpg
    expect(files).toContain("alex-dream-big.pdf");

    const md = await readFile(path.join(dir, "prompts.md"), "utf8");
    expect(md).toContain("00-character.png");
    expect(dir).toContain("alex");

    await rm(base, { recursive: true, force: true });
  });
});

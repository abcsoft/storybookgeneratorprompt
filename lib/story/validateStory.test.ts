import { describe, expect, it } from "vitest";
import { validateCompanion, validateStoryTemplate } from "./validateStory";
import { listBooks } from "./registry";
import type { ChildProfile, StoryTemplate } from "./types";

const BOY: ChildProfile = { name: "Aarav", age: 4, gender: "boy" };
const GIRL: ChildProfile = { name: "Zara", age: 6, gender: "girl" };

describe("validateStoryTemplate — every registered book, generically", () => {
  const books = listBooks();

  it("registers at least the 10 expected books", () => {
    expect(books.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every registered book a unique id", () => {
    const ids = books.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(books.map((b): [string, StoryTemplate] => [b.id, b]))(
    "passes validation for a boy child: %s",
    (_id, book) => {
      expect(validateStoryTemplate(book, BOY)).toEqual([]);
    },
  );

  it.each(books.map((b): [string, StoryTemplate] => [b.id, b]))(
    "passes validation for a girl child: %s",
    (_id, book) => {
      expect(validateStoryTemplate(book, GIRL)).toEqual([]);
    },
  );

  // Great Adventure is the pre-Phase-4 baseline — its own dedicated test
  // file (greatAdventureTemplate.test.ts) already covers deep regression
  // (spread positions, ink, personalization); this just confirms it still
  // clears the same generic content gate as every new story.
  it("Great Adventure regression: still passes the shared validator unchanged", () => {
    const greatAdventure = books.find((b) => b.id === "great-adventure");
    expect(greatAdventure).toBeDefined();
    expect(validateStoryTemplate(greatAdventure!, BOY)).toEqual([]);
  });
});

describe("validateStoryTemplate — malformed-input detection", () => {
  const base = listBooks().find((b) => b.id === "kindness-garden")!;

  it("flags an empty title", () => {
    const broken: StoryTemplate = { ...base, title: "" };
    const issues = validateStoryTemplate(broken, BOY);
    expect(issues.some((i) => i.includes("title is empty"))).toBe(true);
  });

  it("flags a missing cover page", () => {
    const broken: StoryTemplate = {
      ...base,
      pages: base.pages.filter((p) => p.kind !== "cover"),
    };
    const issues = validateStoryTemplate(broken, BOY);
    expect(issues.some((i) => i.includes("expected exactly 1 cover page"))).toBe(true);
  });

  it("flags an unsupported layout value", () => {
    const broken: StoryTemplate = {
      ...base,
      pages: base.pages.map((p, i) =>
        i === 2 ? { ...p, layout: "diagonal-swoop" as never } : p,
      ),
    };
    const issues = validateStoryTemplate(broken, BOY);
    expect(issues.some((i) => i.includes("unsupported layout"))).toBe(true);
  });

  it("flags a companion with an empty consistencyRules field", () => {
    const issues = validateCompanion(
      { name: "Rex", description: "a dog", consistencyRules: "" },
      "test",
    );
    expect(issues.some((i) => i.includes("consistencyRules is empty"))).toBe(true);
  });

  it("accepts no companion at all", () => {
    expect(validateCompanion(undefined, "test")).toEqual([]);
    expect(validateCompanion(null, "test")).toEqual([]);
  });

  it("flags a story page whose built prompt duplicates a global rule marker", () => {
    const broken: StoryTemplate = {
      ...base,
      pages: base.pages.map((p, i) =>
        i === 2
          ? {
              ...p,
              illustrationPrompt: (c: ChildProfile) =>
                `IDENTITY FIRST — duplicated once already. ${p.illustrationPrompt(c)}`,
            }
          : p,
      ),
    };
    const issues = validateStoryTemplate(broken, BOY);
    expect(issues.some((i) => i.includes('repeats the global "IDENTITY FIRST"'))).toBe(true);
  });
});

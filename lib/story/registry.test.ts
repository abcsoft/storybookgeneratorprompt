import { describe, expect, it } from "vitest";
import {
  buildPages,
  DEFAULT_BOOK_ID,
  getBook,
  listBooks,
} from "./registry";
import type { ChildProfile } from "./types";

const child: ChildProfile = { name: "Alex", age: 4, gender: "boy" };

describe("registry", () => {
  it("lists at least the default book", () => {
    const books = listBooks();
    expect(books.some((b) => b.id === DEFAULT_BOOK_ID)).toBe(true);
  });

  it("resolves the default book when no id is given", () => {
    expect(getBook().id).toBe(DEFAULT_BOOK_ID);
  });

  it("falls back to the default for an unknown id", () => {
    expect(getBook("does-not-exist").id).toBe(DEFAULT_BOOK_ID);
  });

  it("builds personalized pages for a book id", () => {
    const pages = buildPages(child, DEFAULT_BOOK_ID);
    expect(pages.length).toBe(24);
    expect(pages[0].kind).toBe("cover");
    expect(pages.some((p) => p.prompt.includes("Alex") || p.text.includes("Alex"))).toBe(true);
  });

  it("defaults the book id when omitted", () => {
    expect(buildPages(child).length).toBe(24);
  });

  it("provides structured spread composition rules for all registered storybook spreads", () => {
    const pages = buildPages(child, "dream-big");
    const spreads = pages.filter((p) => p.spread);
    expect(spreads.length).toBeGreaterThan(0);
    for (const page of spreads) {
      expect(page.prompt).toContain("COMPOSITION (two-page spread)");
    }
  });

  it("does not double up the legacy spread note for pages that declare a layout", () => {
    const pages = buildPages(child, "great-adventure");
    const spreads = pages.filter((p) => p.spread);
    expect(spreads.length).toBeGreaterThan(0);
    for (const page of spreads) {
      expect(page.prompt).not.toContain("IMPORTANT COMPOSITION");
    }
  });
});

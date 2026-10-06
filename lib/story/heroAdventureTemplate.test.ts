import { describe, expect, it } from "vitest";
import { getHero, HEROES } from "../hero/registry";
import { buildPagesFor } from "./registry";
import { heroAdventureBook } from "./heroAdventureTemplate";

describe("original hero adventure", () => {
  const child = {
    name: "Ihan",
    age: 6,
    gender: "boy" as const,
    heroId: "sky-spark",
  };

  it("ships 20 original hero choices", () => {
    expect(HEROES).toHaveLength(20);
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(20);
    expect(new Set(HEROES.map((h) => h.name)).size).toBe(20);
  });

  it("builds cover + 22 story pages + back cover", () => {
    const pages = buildPagesFor(child, heroAdventureBook);
    expect(pages).toHaveLength(24);
    expect(pages[0].kind).toBe("cover");
    expect(pages[23].kind).toBe("backcover");
    expect(pages[10].role).toBe("HERO REVEAL");
  });

  it("locks the selected hero into canonical and later prompts", () => {
    const pages = buildPagesFor(child, heroAdventureBook);
    const hero = getHero("sky-spark");
    expect(pages[10].prompt).toContain(hero.name);
    expect(pages[10].prompt).toContain(hero.suit);
    expect(pages[18].prompt).toContain(hero.name);
    expect(pages[18].prompt).toContain(hero.suit);
  });

  it("keeps famous-franchise imitation out of the prompt contract", () => {
    const pages = buildPagesFor(child, heroAdventureBook);
    for (const page of pages) {
      expect(page.prompt).toContain("Do not imitate or reference any existing franchise superhero");
    }
  });
});

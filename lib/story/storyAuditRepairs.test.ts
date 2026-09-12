import { describe, expect, it } from "vitest";
import { bedtimeDreamBook } from "./bedtimeDreamTemplate";
import { dinosaurDiscoveryBook } from "./dinosaurDiscoveryTemplate";
import { dreamBigBook } from "./dreamBigTemplate";
import {
  greatAdventureBook,
  greatAdventurePrintify24Edition,
} from "./greatAdventureTemplate";
import { kindnessGardenBook } from "./kindnessGardenTemplate";
import { rainbowKingdomBook } from "./rainbowKingdomTemplate";
import { safariFriendshipBook } from "./safariFriendshipTemplate";
import { spaceExplorerBook } from "./spaceExplorerTemplate";
import { theGreatDetectiveBook } from "./theGreatDetectiveTemplate";
import type { ChildProfile } from "./types";
import { underwaterKingdomBook } from "./underwaterKingdomTemplate";

const PROFILES: Record<string, ChildProfile> = {
  boy: {
    name: "Leo",
    gender: "boy",
    age: 6,
  },
  girl: {
    name: "Maya",
    gender: "girl",
    age: 7,
  },
  neutral: {
    name: "Alex",
    gender: "neutral",
    age: 6,
  },
};

describe("Nine Story Templates - Audit and Repair Acceptance Tests", () => {
  const ALL_TEMPLATES = [
    greatAdventureBook,
    theGreatDetectiveBook,
    kindnessGardenBook,
    dinosaurDiscoveryBook,
    spaceExplorerBook,
    rainbowKingdomBook,
    safariFriendshipBook,
    underwaterKingdomBook,
    bedtimeDreamBook,
    dreamBigBook,
  ];

  it("all templates generate valid text and illustration prompts across boy, girl, and neutral profiles", () => {
    for (const book of ALL_TEMPLATES) {
      for (const [genderKey, profile] of Object.entries(PROFILES)) {
        for (let i = 0; i < book.pages.length; i++) {
          const page = book.pages[i];
          const text = page.text(profile);
          expect(text, `${book.id} p${i} text (${genderKey})`).toBeTruthy();
          expect(text).not.toContain("undefined");
          expect(text).not.toContain("NaN");
          expect(text).not.toContain("[object Object]");
          expect(text).not.toContain("${");

          const prompt = page.illustrationPrompt(profile, "printify-8x8");
          expect(prompt, `${book.id} p${i} prompt (${genderKey})`).toBeTruthy();
          expect(prompt).not.toContain("undefined");
          expect(prompt).not.toContain("${");
        }
      }
    }
  });

  describe("Story 1: Great Adventure", () => {
    it("preserves chronological order in printify-8x8 24-page edition without narrative shuffling", () => {
      const pages = greatAdventurePrintify24Edition.physicalPages;
      const introPage = pages.find((p) => p.physicalPageNumber === 1);
      const sailingPage = pages.find((p) => p.physicalPageNumber === 2);
      const junglePage = pages.find((p) => p.physicalPageNumber === 3);
      const islandPage = pages.find((p) => p.physicalPageNumber === 17);
      const chestPage = pages.find((p) => p.physicalPageNumber === 20);
      const flyingPage = pages.find((p) => p.physicalPageNumber === 22);
      const bedtimePage = pages.find((p) => p.physicalPageNumber === 24);

      const getPageText = (page?: { text: string | ((c: ChildProfile) => string) | null }) => {
        if (!page || !page.text) return "";
        return typeof page.text === "function" ? page.text(PROFILES.boy) : page.text;
      };

      expect(getPageText(introPage)).toContain("glowing map");
      expect(getPageText(sailingPage)).toContain("adventure begins today");
      expect(getPageText(junglePage)).toContain("jungle");
      expect(getPageText(islandPage)).toContain("island");
      expect(getPageText(chestPage)).toContain("lid");
      expect(getPageText(flyingPage)).toContain("flew");
      expect(getPageText(bedtimePage)).toContain("home at last");
    });

    it("ensures storm scene secures the map and avoids impossible simultaneous two-hand overload", () => {
      const stormScene = greatAdventureBook.pages.find((p) =>
        p.text(PROFILES.boy).toLowerCase().includes("storm"),
      );
      expect(stormScene).toBeDefined();
      const prompt = stormScene!.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("backpack");
      expect(prompt).toContain("gripping the sturdy mast with one hand");
      expect(prompt).toContain("the other arm shelters Scout securely");
    });

    it("ensures Scout is present in the whale scene with magical fantasy protection", () => {
      const whalePage = greatAdventureBook.pages.find((p) =>
        p.text(PROFILES.boy).toLowerCase().includes("whale"),
      );
      expect(whalePage).toBeDefined();
      const prompt = whalePage!.illustrationPrompt(PROFILES.boy);
      expect(prompt.toLowerCase()).toContain("scout");
      expect(prompt.toLowerCase()).toContain("bubble");
    });
  });

  describe("Story 2: Great Detective", () => {
    it("replaces hardcoded female pronouns with dynamic personalized pronouns", () => {
      const boyTexts = theGreatDetectiveBook.pages.map((p) => p.text(PROFILES.boy));
      for (const t of boyTexts) {
        expect(t).not.toContain("She didn't use magic");
        expect(t).not.toContain("Both girls");
      }
      const introBoy = theGreatDetectiveBook.pages[1].text(PROFILES.boy);
      expect(introBoy).toContain("He didn't use magic");

      const girlTexts = theGreatDetectiveBook.pages.map((p) => p.text(PROFILES.girl));
      const introGirl = theGreatDetectiveBook.pages[1].text(PROFILES.girl);
      expect(introGirl).toContain("She didn't use magic");
    });

    it("uses a deterministic unisex outfit and avoids gender stereotyping", () => {
      expect(theGreatDetectiveBook.defaultOutfit).not.toContain("skirt");
      expect(theGreatDetectiveBook.defaultOutfit).toContain("rolled-cuff explorer shorts");
    });

    it("does not contain blanket exclusion restrictions like 'single boy only' or 'no other girls'", () => {
      for (const page of theGreatDetectiveBook.pages) {
        const prompt = page.illustrationPrompt(PROFILES.girl);
        expect(prompt).not.toContain("single boy only (no other boys, no girls)");
        expect(prompt).not.toContain("no other girls");
      }
    });

    it("reunites Rohan and Meera kindly without accusing Meera of theft", () => {
      const returnBallPage = theGreatDetectiveBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("handed over the ball"),
      );
      expect(returnBallPage).toBeDefined();
      const text = returnBallPage!.text(PROFILES.boy);
      expect(text).toContain("It's okay to feel shy");
      expect(text).not.toContain("stole the ball");

      const invitePage = theGreatDetectiveBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("Will you come with me to return it"),
      );
      expect(invitePage).toBeDefined();
      expect(invitePage!.text(PROFILES.boy)).toContain('"Yes!" said Leo');
    });

    it("reserves back cover detective sign artwork region for application typography", () => {
      const backPage = theGreatDetectiveBook.pages.find((p) => p.kind === "backcover");
      expect(backPage).toBeDefined();
      const prompt = backPage!.illustrationPrompt(PROFILES.neutral);
      expect(prompt).toContain("blank wooden placard face completely free of letters");
      expect(prompt).toContain("reserved for title overlay");
      expect(prompt).toContain("suitable for overlaid typography");
    });
  });

  describe("Story 3: Kindness Garden", () => {
    it("keeps Pip absent from opening and introduction before the bramble rescue", () => {
      const introPrompt = kindnessGardenBook.pages[1].illustrationPrompt(PROFILES.boy);
      expect(introPrompt).not.toContain("Pip");
    });

    it("establishes planting before the windowsill flower closing", () => {
      const beat1Text = kindnessGardenBook.pages[3].text(PROFILES.girl);
      expect(beat1Text).toContain("planted the glowing seed in a warm little pot of earth");

      const closingText = kindnessGardenBook.pages.find((p) => p.kind === "closing")!.text(PROFILES.girl);
      expect(closingText).toContain("glowing flower");
    });

    it("specifies picture sketches instead of generated readable words in notebook", () => {
      const beat7Page = kindnessGardenBook.pages[9]; // beat 7 (notebook sketches)
      const prompt = beat7Page.illustrationPrompt(PROFILES.girl);
      expect(prompt).toContain("drawing picture sketches of the garden animals");
      expect(prompt).toContain("ABSOLUTELY NO TEXT IN THE IMAGE");
    });
  });

  describe("Story 4: Dinosaur Discovery", () => {
    it("keeps Sprout absent before the leaf rescue", () => {
      for (let i = 1; i <= 4; i++) {
        const prompt = dinosaurDiscoveryBook.pages[i].illustrationPrompt(PROFILES.boy);
        expect(prompt, `Page ${i} should not include Sprout`).not.toContain("Sprout");
      }
    });

    it("does not duplicate fossil discovery between intro and Beat 0", () => {
      const introPrompt = dinosaurDiscoveryBook.pages[1].illustrationPrompt(PROFILES.boy);
      expect(introPrompt).not.toContain("glowing fossil");
      expect(introPrompt).toContain("curiously inspecting leafy green plants");

      const beat0Prompt = dinosaurDiscoveryBook.pages[2].illustrationPrompt(PROFILES.boy);
      expect(beat0Prompt).toContain("brushing soil away from a smooth stone embossed with a distinct three-toed dinosaur footprint fossil");
    });

    it("maintains consistent three-toed footprint fossil shape through matching symbol scene", () => {
      const wallPage = dinosaurDiscoveryBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("gateway"),
      );
      expect(wallPage).toBeDefined();
      const prompt = wallPage!.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("three-toed footprint");
      expect(prompt).toContain("tracing an etched three-toed footprint marking on the rock surface");
    });

    it("resolves closing stone location: on nightstand, hands under covers (not simultaneously in hand and on nightstand)", () => {
      const closingPage = dinosaurDiscoveryBook.pages.find((p) => p.kind === "closing");
      expect(closingPage).toBeDefined();
      const prompt = closingPage!.illustrationPrompt(PROFILES.girl);
      expect(prompt).toContain("hands resting peacefully on top of the folded quilt");
      expect(prompt).toContain("three-toed fossil stone rests and glows with a gentle golden warmth");
      expect(prompt).not.toContain("turning the small fossil stone over in one hand as it glows softly on the nightstand");
    });

    it("clarifies Sprout's family nesting home and child's return home", () => {
      const ridgePage = dinosaurDiscoveryBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("ridge"),
      );
      expect(ridgePage).toBeDefined();
      const text = ridgePage!.text(PROFILES.boy);
      expect(text).toContain("waved a fond farewell to Sprout");
      expect(text).toContain("Following the fossil stone's warm glow back through the secret path to the garden gate");
    });
  });

  describe("Story 5: Journey to the Stars", () => {
    it("keeps Orbit absent before the Moon encounter", () => {
      for (let i = 1; i <= 5; i++) {
        const prompt = spaceExplorerBook.pages[i].illustrationPrompt(PROFILES.boy);
        expect(prompt, `Page ${i} should not include Orbit`).not.toContain("Orbit");
      }
    });

    it("uses closed transparent spherical bubble helmet in exposed space environments", () => {
      expect(spaceExplorerBook.defaultOutfit).toContain("crystal-clear fully transparent spherical bubble helmet");
      const moonPage = spaceExplorerBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("Moon"),
      );
      expect(moonPage).toBeDefined();
      const moonPrompt = moonPage!.illustrationPrompt(PROFILES.boy);
      expect(moonPrompt).toContain("clear transparent bubble helmet");
    });

    it("sketches constellation onto paper star chart to eliminate unexplained handheld map manifestation", () => {
      const deskPage = spaceExplorerBook.pages[2]; // Beat 0
      const prompt = deskPage.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("drawing a glowing constellation pattern onto a paper star chart");
    });

    it("aligns launch scene with child sitting inside the rocket cockpit", () => {
      const launchPage = spaceExplorerBook.pages[3]; // Beat 1
      const text = launchPage.text(PROFILES.boy);
      const prompt = launchPage.illustrationPrompt(PROFILES.boy);
      expect(text).toContain("climbed into the little rocket");
      expect(prompt).toContain("Sitting securely inside the brightly lit cockpit of the small friendly rocket ship");
      expect(prompt).not.toContain("Standing beside a small friendly rocket ship on a backyard launch pad");
    });

    it("distinguishes Orbit power recharge on Moon from navigation compass repair on crystal planet", () => {
      const moonPage = spaceExplorerBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("Moon"),
      );
      expect(moonPage!.text(PROFILES.boy)).toContain("solar battery");

      const crystalRepairPage = spaceExplorerBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("navigation compass"),
      );
      expect(crystalRepairPage!.text(PROFILES.boy)).toContain("navigation compass had slipped loose");
    });

    it("uses coherent forward viewport cockpit return camera and establishes Orbit farewell", () => {
      const returnPage = spaceExplorerBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("beacon"),
      );
      expect(returnPage).toBeDefined();
      const text = returnPage!.text(PROFILES.boy);
      expect(text).toContain("joyful wave goodbye");

      const prompt = returnPage!.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("Inside the spaceship cockpit looking forward");
      expect(prompt).toContain("coherent cockpit view");
      expect(prompt).not.toContain("camera behind the ship");
    });
  });

  describe("Story 6: Rainbow Kingdom", () => {
    it("keeps Luma absent before the first encounter", () => {
      expect(rainbowKingdomBook.pages[1].illustrationPrompt(PROFILES.boy)).not.toContain("Luma");
      expect(rainbowKingdomBook.pages[2].illustrationPrompt(PROFILES.boy)).not.toContain("Luma");
      expect(rainbowKingdomBook.pages[3].illustrationPrompt(PROFILES.boy)).not.toContain("Luma");
    });

    it("uses a deterministic outfit and removes 'dress OR overalls' alternative", () => {
      expect(rainbowKingdomBook.defaultOutfit).not.toContain("dress or overalls");
      expect(rainbowKingdomBook.defaultOutfit).toContain("pale gold explorer overalls");
    });

    it("attributes Luma's dialogue to Luma rather than child pronouns", () => {
      const cloudBridgePage = rainbowKingdomBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("faded"),
      );
      expect(cloudBridgePage).toBeDefined();
      const text = cloudBridgePage!.text(PROFILES.boy);
      expect(text).toContain('Luma said softly');
      expect(text).not.toContain('he said softly');
      expect(text).not.toContain('she said softly');
    });

    it("reconciles color quest with three magical ribbons restoring the rainbow", () => {
      const restoredPage = rainbowKingdomBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("Woven together"),
      );
      expect(restoredPage).toBeDefined();
      const text = restoredPage!.text(PROFILES.boy);
      expect(text).toContain("three magical ribbons restored a brilliant rainbow");
    });

    it("distinguishes introductory setup from ribbon discovery event", () => {
      const introPrompt = rainbowKingdomBook.pages[1].illustrationPrompt(PROFILES.boy);
      expect(introPrompt).not.toContain("glowing ribbon");
      expect(introPrompt).toContain("standing among blooming flower beds");

      const beat0Prompt = rainbowKingdomBook.pages[2].illustrationPrompt(PROFILES.boy);
      expect(beat0Prompt).toContain("shimmering ribbon that glows with soft starlight caught gently on a branch");
    });
  });

  describe("Story 7: Safari Friendship", () => {
    it("supports pajamas outfit override for bedtime scene", () => {
      const closingPage = safariFriendshipBook.pages.find((p) => p.kind === "closing");
      expect(closingPage).toBeDefined();
      const prompt = closingPage!.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("cozy soft cotton pajamas");
      expect(prompt).not.toContain("sage-green short-sleeve safari shirt");
    });

    it("clarifies that large adult elephant tracks lead toward the family herd", () => {
      const trackPage = safariFriendshipBook.pages.find((p) =>
        p.text(PROFILES.boy).includes("giant elephant tracks"),
      );
      expect(trackPage).toBeDefined();
      const text = trackPage!.text(PROFILES.boy);
      expect(text).toContain("giant elephant tracks");
      const prompt = trackPage!.illustrationPrompt(PROFILES.boy);
      expect(prompt).toContain("large, round adult elephant footprints");
    });

    it("avoids readable lettering in field journal illustrations", () => {
      const beat0Prompt = safariFriendshipBook.pages[2].illustrationPrompt(PROFILES.boy);
      expect(beat0Prompt).toContain("no readable lettering");

      const closingPrompt = safariFriendshipBook.pages.find((p) => p.kind === "closing")!.illustrationPrompt(PROFILES.boy);
      expect(closingPrompt).toContain("without readable words");
    });

    it("removes unnecessary repetition between opening and first discovery scene", () => {
      const introPrompt = safariFriendshipBook.pages[1].illustrationPrompt(PROFILES.boy);
      expect(introPrompt).toContain("Standing on a wooden savanna lodge porch at dawn");
      expect(introPrompt).not.toContain("field journal");

      const beat0Prompt = safariFriendshipBook.pages[2].illustrationPrompt(PROFILES.boy);
      expect(beat0Prompt).toContain("Sitting on a wooden porch step at sunrise, carefully opening a worn brown leather field journal");
    });
  });

  describe("Story 8: Secret Under the Sea", () => {
    it("resolves closing spread metadata and layout contract alignment", () => {
      const closingPage = underwaterKingdomBook.pages.find((p) => p.kind === "closing")!;
      expect(closingPage.spread).toBe(true);
      const prompt = closingPage.illustrationPrompt(PROFILES.girl);
      expect(prompt).toContain("two-page continuous spread");
    });

    it("removes ambiguous references to child having fins while preserving human anatomy", () => {
      for (const page of underwaterKingdomBook.pages) {
        const prompt = page.illustrationPrompt(PROFILES.girl);
        expect(prompt).not.toContain("keep fins, hands, and feet");
        expect(prompt).not.toContain("the child's fins/limbs");
      }
    });

    it("tracks spiral shell and round pearl as separate distinct objects", () => {
      const beat0Text = underwaterKingdomBook.pages[2].text(PROFILES.girl);
      expect(beat0Text).toContain("spiral shell");

      const pearlPage = underwaterKingdomBook.pages.find((p) =>
        p.text(PROFILES.girl).includes("archway pedestal"),
      );
      expect(pearlPage).toBeDefined();
      expect(pearlPage!.text(PROFILES.girl)).toContain("pearl");
    });

    it("replaces 'standing mid-swim' with coherent swimming pose", () => {
      const coverPrompt = underwaterKingdomBook.pages[0].illustrationPrompt(PROFILES.girl);
      expect(coverPrompt).not.toContain("standing on the RIGHT side of the frame mid-swim");
      expect(coverPrompt).toContain("swimming gracefully on the RIGHT side of the frame");
    });

    it("establishes beach return before closing towel scene", () => {
      const restorationPage = underwaterKingdomBook.pages.find((p) =>
        p.text(PROFILES.girl).includes("archway pedestal"),
      );
      expect(restorationPage!.text(PROFILES.girl)).toContain("golden beach");
    });
  });

  describe("Story 9: Starlit Dream", () => {
    it("distinguishes silver guiding star from golden lost star Twinkle", () => {
      const beat0Text = bedtimeDreamBook.pages[2].text(PROFILES.boy);
      expect(beat0Text).toContain("silver guiding star");

      const beat3Text = bedtimeDreamBook.pages[5].text(PROFILES.boy);
      expect(beat3Text).toContain("Twinkle, a tiny golden star");
    });

    it("maintains consistent 4 waiting stars + 1 vacant position = 5 stars constellation", () => {
      const tracePage = bedtimeDreamBook.pages[9]; // Beat 7
      const traceText = tracePage.text(PROFILES.boy);
      expect(traceText).toContain("four waiting stars in the sky with one open spot");

      const completePage = bedtimeDreamBook.pages[10]; // Beat 8
      const completeText = completePage.text(PROFILES.boy);
      expect(completeText).toContain("settled gently into the open spot among the four waiting stars");
      expect(completeText).toContain("Now five bright stars shone together");
    });

    it("places Twinkle in the constellation rather than duplicating beside child in reunion/return", () => {
      const completePrompt = bedtimeDreamBook.pages[10].illustrationPrompt(PROFILES.boy);
      expect(completePrompt).not.toContain("Twinkle glowing beside");
      expect(completePrompt).toContain("complete five-star constellation");

      const returnPrompt = bedtimeDreamBook.pages[11].illustrationPrompt(PROFILES.boy);
      expect(returnPrompt).not.toContain("Twinkle glowing beside");
      expect(returnPrompt).toContain("complete five-star constellation");
    });

    it("removes repeated opening action between intro and Beat 0", () => {
      const introPrompt = bedtimeDreamBook.pages[1].illustrationPrompt(PROFILES.boy);
      expect(introPrompt).toContain("tucked under soft bedcovers in blue pajamas, looking peacefully through the bedroom window");

      const beat0Prompt = bedtimeDreamBook.pages[2].illustrationPrompt(PROFILES.boy);
      expect(beat0Prompt).toContain("Sitting up gently in bed in soft pajamas as a friendly silver guiding star drifts in");
    });
  });

  describe("Dream Big (Preservation Regression)", () => {
    it("preserves Dream Big template integrity and layout plans without regressions", () => {
      expect(dreamBigBook.pages.length).toBeGreaterThanOrEqual(12);
      for (const page of dreamBigBook.pages) {
        const text = page.text(PROFILES.girl);
        expect(text).toBeTruthy();
        const prompt = page.illustrationPrompt(PROFILES.girl);
        expect(prompt).toBeTruthy();
      }
    });
  });
});

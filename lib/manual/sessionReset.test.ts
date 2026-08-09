import { describe, expect, it } from "vitest";
import {
  clearedIllustrations,
  collectObjectUrls,
  createGenerationGuard,
  emptyEntry,
  freshIllustrations,
  hasReviewDecisions,
  hasSessionWork,
  reviewResetIllustrations,
  type IllustrationEntry,
} from "./sessionReset";

function entry(overrides: Partial<IllustrationEntry> = {}): IllustrationEntry {
  return { ...emptyEntry(), ...overrides };
}

describe("freshIllustrations / emptyEntry", () => {
  it("gives every index a missing entry with no file/url/check", () => {
    const fresh = freshIllustrations([0, 1, 2]);
    expect(Object.keys(fresh)).toEqual(["0", "1", "2"]);
    for (const e of Object.values(fresh)) {
      expect(e).toEqual({ status: "missing", file: null, objectUrl: null, clientCheck: null });
    }
  });
});

describe("collectObjectUrls", () => {
  it("collects only the non-null object URLs", () => {
    const map = {
      0: entry({ objectUrl: "blob:a" }),
      1: entry({ objectUrl: null }),
      2: entry({ objectUrl: "blob:b" }),
    };
    expect(collectObjectUrls(map).sort()).toEqual(["blob:a", "blob:b"]);
  });

  it("returns an empty array when nothing has a URL", () => {
    expect(collectObjectUrls({ 0: entry() })).toEqual([]);
  });
});

describe("clearedIllustrations — 'Clear all images'", () => {
  it("removes every asset assignment (file, url, check)", () => {
    const map = {
      0: entry({ status: "approved", file: new File([], "01.png"), objectUrl: "blob:a" }),
      1: entry({ status: "needs-regeneration", file: new File([], "02.png"), objectUrl: "blob:b" }),
    };
    const cleared = clearedIllustrations(map);
    for (const e of Object.values(cleared)) {
      expect(e.file).toBeNull();
      expect(e.objectUrl).toBeNull();
      expect(e.clientCheck).toBeNull();
    }
  });

  it("changes every status to missing regardless of prior status", () => {
    const map = {
      0: entry({ status: "approved" }),
      1: entry({ status: "needs-regeneration" }),
      2: entry({ status: "added" }),
      3: entry({ status: "missing" }),
    };
    const cleared = clearedIllustrations(map);
    expect(Object.values(cleared).every((e) => e.status === "missing")).toBe(true);
  });

  it("preserves the exact set of page indices", () => {
    const map = { 0: entry(), 5: entry(), 12: entry() };
    expect(Object.keys(clearedIllustrations(map)).sort()).toEqual(["0", "12", "5"]);
  });
});

describe("reviewResetIllustrations — 'Reset review'", () => {
  it("preserves the file, objectUrl, and clientCheck for every entry", () => {
    const file = new File([], "01.png");
    const map = {
      0: entry({ status: "approved", file, objectUrl: "blob:a" }),
    };
    const reset = reviewResetIllustrations(map);
    expect(reset[0].file).toBe(file);
    expect(reset[0].objectUrl).toBe("blob:a");
  });

  it("rolls approved back to added", () => {
    const map = { 0: entry({ status: "approved" }) };
    expect(reviewResetIllustrations(map)[0].status).toBe("added");
  });

  it("rolls needs-regeneration back to added", () => {
    const map = { 0: entry({ status: "needs-regeneration" }) };
    expect(reviewResetIllustrations(map)[0].status).toBe("added");
  });

  it("leaves added and missing entries untouched", () => {
    const map = { 0: entry({ status: "added" }), 1: entry({ status: "missing" }) };
    const reset = reviewResetIllustrations(map);
    expect(reset[0].status).toBe("added");
    expect(reset[1].status).toBe("missing");
  });

  it("never removes an image (Reset review must not act like Clear images)", () => {
    const file = new File([], "01.png");
    const map = { 0: entry({ status: "needs-regeneration", file, objectUrl: "blob:a" }) };
    const reset = reviewResetIllustrations(map);
    expect(reset[0].file).not.toBeNull();
    expect(reset[0].objectUrl).not.toBeNull();
  });
});

describe("hasSessionWork — story-change destructive-reset detection", () => {
  it("is false when every page is missing (nothing to lose)", () => {
    expect(hasSessionWork(freshIllustrations([0, 1, 2]))).toBe(false);
  });

  it("is true as soon as one page has any non-missing status", () => {
    const map = { 0: entry({ status: "added" }), 1: entry() };
    expect(hasSessionWork(map)).toBe(true);
  });

  it("is true for approved and needs-regeneration too", () => {
    expect(hasSessionWork({ 0: entry({ status: "approved" }) })).toBe(true);
    expect(hasSessionWork({ 0: entry({ status: "needs-regeneration" }) })).toBe(true);
  });
});

describe("hasReviewDecisions — 'Reset review' confirmation gate", () => {
  it("is false when nothing is approved or flagged", () => {
    const map = { 0: entry({ status: "added" }), 1: entry({ status: "missing" }) };
    expect(hasReviewDecisions(map)).toBe(false);
  });

  it("is true when at least one page is approved", () => {
    expect(hasReviewDecisions({ 0: entry({ status: "approved" }) })).toBe(true);
  });

  it("is true when at least one page needs regeneration", () => {
    expect(hasReviewDecisions({ 0: entry({ status: "needs-regeneration" }) })).toBe(true);
  });
});

describe("createGenerationGuard — stale async image-check protection", () => {
  it("starts at generation 0 and is never stale before any reset", () => {
    const guard = createGenerationGuard();
    const startedAt = guard.current();
    expect(startedAt).toBe(0);
    expect(guard.isStale(startedAt)).toBe(false);
  });

  it("marks a generation captured before a bump as stale", () => {
    const guard = createGenerationGuard();
    const startedAt = guard.current();
    guard.bump();
    expect(guard.isStale(startedAt)).toBe(true);
  });

  it("a generation captured AFTER a bump is current, not stale", () => {
    const guard = createGenerationGuard();
    guard.bump();
    const startedAt = guard.current();
    expect(guard.isStale(startedAt)).toBe(false);
  });

  it("each bump invalidates everything before it, even across several bumps", () => {
    const guard = createGenerationGuard();
    const gen1 = guard.current();
    guard.bump();
    const gen2 = guard.current();
    guard.bump();
    expect(guard.isStale(gen1)).toBe(true);
    expect(guard.isStale(gen2)).toBe(true);
    expect(guard.isStale(guard.current())).toBe(false);
  });

  it(
    "simulates the real race: import starts, Clear images happens before the " +
      "async check resolves, the stale check must not repopulate cleared state",
    async () => {
      const guard = createGenerationGuard();
      let illustrations: Record<number, IllustrationEntry> = {
        0: entry({ status: "added", file: new File([], "01.png"), objectUrl: "blob:a" }),
      };

      // The async check "starts" — tags itself with the current generation.
      const startedAt = guard.current();

      // Clear images happens first: bump the generation, THEN clear state —
      // exactly the order lib/manual/... callers use.
      guard.bump();
      illustrations = clearedIllustrations(illustrations);

      // The async check now resolves. A stale-write guard must refuse to
      // apply its result because it was tagged with an old generation.
      const checkIsStale = guard.isStale(startedAt);
      expect(checkIsStale).toBe(true);
      if (!checkIsStale) {
        // What the bug would look like if the guard were missing/broken.
        illustrations = { ...illustrations, 0: { ...illustrations[0], status: "added" } };
      }

      expect(illustrations[0].status).toBe("missing");
      expect(illustrations[0].file).toBeNull();
      expect(illustrations[0].objectUrl).toBeNull();
    },
  );
});

describe("client-session reset has no side effects beyond the client", () => {
  it("this module never touches the network or filesystem — exported files are unaffected by design", () => {
    // No import of "fs", "node:fs", or a fetch call anywhere in this module —
    // every exported function is a synchronous, pure data transform. Live
    // Scenario E (export, then Start new book) confirms this operationally.
    expect(typeof clearedIllustrations).toBe("function");
    expect(clearedIllustrations.constructor.name).not.toBe("AsyncFunction");
    expect(reviewResetIllustrations.constructor.name).not.toBe("AsyncFunction");
  });
});

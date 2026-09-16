/**
 * PROPOSAL — NOT ACTIVE. Do not import this from resolveLayoutPlan,
 * lib/story/editions.ts's registry, or any route/UI code.
 *
 * This documents what a "Full Spread 24-Page Edition" for Dream Big would
 * need to contain if editorially approved. It is not a working edition: the
 * `LayoutMode` value "full-spread-24" is rejected by resolveLayoutPlan()
 * with a "coming soon" error until a real, reviewed mapping replaces this
 * file (or a sibling one) and gets registered via registerPrintEdition() in
 * lib/story/editions.ts.
 *
 * Why this can't just be generated automatically: Dream Big's source story
 * has 22 interior beats (Intro + 20 careers + Closing). A fixed 24-physical-
 * page edition under this book's imposition convention (Page 1 standalone,
 * Page 24 standalone, valid facing pairs 2-3 through 22-23) has exactly 11
 * interior facing-pair slots — so it needs exactly 11 spread beats, not 22.
 * Turning 22 source beats into 11 is a content decision (which scenes are
 * combined, rewritten, or cut, and why) — not something layout code should
 * invent unilaterally. Every field below marked TBD requires an editor to
 * decide and write, then this proposal (or its replacement) needs sign-off
 * before anyone wires it into the registry.
 */

export interface FullSpread24BeatMapping {
  /** Physical page(s) this beat occupies in the fixed 24-page book. */
  physicalPages: [number] | [number, number];
  /** Which original Dream Big scene(s) (by role/badge, e.g. "PILOT") this
   *  beat is built from. Empty means a new beat with no direct source. */
  sourceBeats: string[];
  /** "retained" = one source scene, unchanged story beat.
   *  "combined" = two or more source scenes merged into one beat.
   *  "new" = a beat with no 1:1 source (e.g. a newly written transition). */
  disposition: "retained" | "combined" | "new";
  /** Final story text for this beat. TBD until written by an editor. */
  rewrittenText: string | null;
  /** One-sentence summary of what the illustration prompt for this beat
   *  should show. TBD until written by an editor. */
  scenePromptSummary: string | null;
  /** Why this specific mapping was chosen (why these source scenes, why
   *  combined/cut this way). Required for every entry — no silent drops. */
  reason: string;
}

export interface FullSpread24Proposal {
  status: "PROPOSAL_NOT_APPROVED";
  bookId: "dream-big";
  /** Page 1: standalone single page (Dedication/Intro role). */
  page1: FullSpread24BeatMapping;
  /** 11 interior spreads across Pages 2-23 (physical pairs 2-3 .. 22-23). */
  interiorSpreads: FullSpread24BeatMapping[];
  /** Page 24: standalone single page (Backcover role). */
  page24: FullSpread24BeatMapping;
  /** Every source beat from the original 22-scene template, and what
   *  becomes of it — required so nothing is silently dropped. */
  sourceBeatDisposition: {
    role: string;
    outcome: "retained-as-own-spread" | "combined-into-another-spread" | "omitted";
    /** Required when outcome is "combined-into-another-spread" or "omitted". */
    reason: string | null;
  }[];
}

/**
 * TBD skeleton — every creative field is `null`/empty pending editorial
 * review. This object is intentionally incomplete: it exists to show the
 * shape the real proposal must fill in, not to be evaluated as content.
 */
export const dreamBigFullSpread24Proposal: FullSpread24Proposal = {
  status: "PROPOSAL_NOT_APPROVED",
  bookId: "dream-big",
  page1: {
    physicalPages: [1],
    sourceBeats: ["intro"],
    disposition: "retained",
    rewrittenText: null,
    scenePromptSummary: null,
    reason: "TBD — editorial review required.",
  },
  interiorSpreads: Array.from({ length: 11 }, (_, i) => ({
    physicalPages: [2 + i * 2, 3 + i * 2] as [number, number],
    sourceBeats: [], // TBD — which of the 20 careers + Closing map here
    disposition: "combined" as const,
    rewrittenText: null,
    scenePromptSummary: null,
    reason: "TBD — editorial review required: which source scenes combine into this spread, and why.",
  })),
  page24: {
    physicalPages: [24],
    sourceBeats: ["backcover"],
    disposition: "retained",
    rewrittenText: null,
    scenePromptSummary: null,
    reason: "TBD — editorial review required.",
  },
  // 22 source beats (20 careers + Closing) need an explicit outcome each —
  // left empty until the 11 interiorSpreads above are actually filled in,
  // since only then can each source beat's fate be truthfully stated.
  sourceBeatDisposition: [],
};

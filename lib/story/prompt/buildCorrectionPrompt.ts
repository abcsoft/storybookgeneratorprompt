/**
 * Correction-prompt builder (item 4) — turns an already-generated
 * illustration's original prompt plus a set of selected issue flags into a
 * ready-to-paste regeneration prompt. Never rewrites the story scene: the
 * original prompt is carried through verbatim, only wrapped with fix
 * instructions.
 */

export type CorrectionIssue =
  | "subject-cropped"
  | "wrong-face"
  | "wrong-outfit"
  | "wrong-companion"
  | "extra-character"
  | "stray-body-part"
  | "too-close-to-edge"
  | "crossed-gutter"
  | "wrong-spread-side"
  | "bad-composition"
  | "too-close-up"
  | "custom";

export interface CorrectionIssueDef {
  id: CorrectionIssue;
  /** Short label for the issue-flag checkbox in the UI. */
  label: string;
  /** The fix instruction folded into the correction prompt. */
  instruction: string;
}

/**
 * The catalog of selectable issue flags. Order here is the order shown in
 * the UI's checkbox list.
 */
export const CORRECTION_ISSUES: CorrectionIssueDef[] = [
  {
    id: "subject-cropped",
    label: "Subject cropped",
    instruction:
      "The subject was cropped at the edge of the image. Regenerate with a WIDER camera so the " +
      "entire subject (including hands, feet, and the top of the head) is fully inside the " +
      "frame, with at least a 10-12% outer safety margin from every edge. Keep the same " +
      "identity, outfit, companion, and scene — do not introduce any new characters.",
  },
  {
    id: "wrong-face",
    label: "Wrong face / weak likeness",
    instruction:
      "The child's face doesn't match the reference photos closely enough. Regenerate matching " +
      "the real child's face, proportions, eye color, and hair exactly, as described in the " +
      "identity instructions — do not change anything else about the scene.",
  },
  {
    id: "wrong-outfit",
    label: "Wrong outfit",
    instruction:
      "The child's outfit doesn't match what was specified. Regenerate with the exact outfit " +
      "described in the prompt below, unchanged — do not invent a different outfit.",
  },
  {
    id: "wrong-companion",
    label: "Wrong companion",
    instruction:
      "The companion animal/character doesn't match its description (wrong look, wrong species, " +
      "or duplicated). Regenerate with exactly one companion, matching its consistency " +
      "description in the prompt below.",
  },
  {
    id: "extra-character",
    label: "Extra character",
    instruction:
      "An extra character or duplicate subject appeared that isn't in the scene description. " +
      "Regenerate with only the characters explicitly named in the prompt below — no additional " +
      "people, animals, or duplicates.",
  },
  {
    id: "stray-body-part",
    label: "Stray hand or body part",
    instruction:
      "A stray hand, foot, or other partial body part appears disconnected or entering from an " +
      "edge. Regenerate with correct anatomy only — no partial limbs entering from any edge of " +
      "the image.",
  },
  {
    id: "too-close-to-edge",
    label: "Subject too close to edge",
    instruction:
      "The subject sits too close to the outer edge of the page. Regenerate with the subject " +
      "pulled inward so it keeps at least a 10-12% safety margin from every outer edge.",
  },
  {
    id: "crossed-gutter",
    label: "Subject crossed the gutter",
    instruction:
      "The subject crosses into the center fold/gutter of this two-page spread. Regenerate " +
      "restoring the original text-left / subject-right layout exactly: keep the LEFT half calm " +
      "background only, keep the center gutter completely clear of faces, hands, feet, and the " +
      "companion, and keep the complete subject inside the RIGHT half.",
  },
  {
    id: "wrong-spread-side",
    label: "Wrong side of spread",
    instruction:
      "The subject was placed on the wrong side of this two-page spread. Regenerate restoring " +
      "the original text-left / subject-right layout: calm open background on the left half " +
      "(where the story text goes), the complete subject safely inside the right half.",
  },
  {
    id: "bad-composition",
    label: "Bad composition",
    instruction:
      "The overall composition doesn't read well (awkward framing, unbalanced, or confusing). " +
      "Regenerate with a clearer, wider, more natural composition while keeping the same scene, " +
      "identity, outfit, and companion.",
  },
  {
    id: "too-close-up",
    label: "Too close-up",
    instruction:
      "The shot is too tight/close-up. Regenerate as a natural medium shot from a slight " +
      "distance, matching the framing described in the prompt below — not an extreme close-up.",
  },
];

export interface BuildCorrectionPromptOptions {
  /** The exact prompt originally used to generate this illustration. */
  originalPrompt: string;
  issues: CorrectionIssue[];
  /** Free-text note for the "custom issue" flag (or any extra detail). */
  customNote?: string;
}

/** Look up an issue's instruction text by id. */
export function issueInstruction(id: CorrectionIssue): string | undefined {
  return CORRECTION_ISSUES.find((i) => i.id === id)?.instruction;
}

export function buildCorrectionPrompt(opts: BuildCorrectionPromptOptions): string {
  const rules = opts.issues
    .map((id) => issueInstruction(id))
    .filter((text): text is string => Boolean(text));

  const preamble =
    "CORRECTION REQUEST — regenerate the SAME illustration below, fixing ONLY the issues listed " +
    "here. Do not rewrite or reinterpret the scene, and do not introduce any new characters — " +
    "keep the exact same identity/likeness, outfit, companion, and scene as the original prompt.";

  const sections = [
    preamble,
    rules.length > 0
      ? `ISSUES TO FIX:\n${rules.map((r) => `- ${r}`).join("\n")}`
      : "",
    opts.customNote?.trim() ? `ADDITIONAL NOTE: ${opts.customNote.trim()}` : "",
    `ORIGINAL PROMPT (regenerate from this, applying only the fixes above):\n${opts.originalPrompt}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

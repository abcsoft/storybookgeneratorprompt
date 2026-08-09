/** Barrel export for the reusable prompt module. */

export { buildIllustrationPrompt } from "./buildIllustrationPrompt";
export type { BuildIllustrationPromptOptions } from "./buildIllustrationPrompt";
export {
  buildCorrectionPrompt,
  CORRECTION_ISSUES,
  issueInstruction,
} from "./buildCorrectionPrompt";
export type {
  BuildCorrectionPromptOptions,
  CorrectionIssue,
  CorrectionIssueDef,
} from "./buildCorrectionPrompt";
export { CHARACTER_ANCHOR_STYLE, characterAnchorPrompt } from "./characterAnchor";
export { companionRules } from "./companionRules";
export {
  singlePageCompositionRules,
  spreadCompositionRules,
} from "./compositionRules";
export { identityRules } from "./identityRules";
export { negativeRules } from "./negativeRules";
export { styleRules } from "./styleRules";
export { wardrobeRules } from "./wardrobeRules";

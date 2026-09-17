export type SemanticMatchStatus =
  | "MATCH"
  | "POSSIBLE_MISMATCH"
  | "NOT_CHECKED"
  | "CHECK_FAILED";

export type SemanticAnalysisMethod =
  | "external-vision-api"
  | "ollama-vision"
  | "test-mock-vision"
  | "metadata-inspection"
  | "none";

/** A normalized (0-1 of image width/height) bounding box for a protected
 *  region the vision provider detected — never covered by story-text
 *  placement (see lib/story/textPlacement.ts). */
export interface ProtectedRegionBox {
  kind:
    | "face"
    | "child-body"
    | "companion"
    | "required-prop"
    | "required-action"
    | "qr-code"
    | "secret-marker"
    | "treasure-chest"
    | "hands-on-chest"
    | "shining-star";
  x: number;
  y: number;
  width: number;
  height: number;
  /** The provider's own confidence in this specific detected region. */
  confidence?: number;
}

export interface SemanticValidationResult {
  status: SemanticMatchStatus;
  slotId: string;
  filename: string;
  expectedRole: string;
  detectedContent: string;
  confidence: number;
  explanation: string;
  providerId?: string;
  analysisMethod: SemanticAnalysisMethod;
  candidateSwapSlotId?: string;
  checkedAt: string;
  userApprovedManualOverride?: boolean;
  overrideTimestamp?: string;
  overrideReason?: string;
  /** Bound to the exact image bytes this result was computed against —
   *  replacing/reverting the image or the scene's semantic-contract
   *  fingerprint invalidates the result (see
   *  invalidateSemanticResultIfStale in semanticValidator.ts). */
  boundImageSha256?: string;
  boundContractFingerprint?: string;
  /** Structured detections, when a real vision provider populated them. */
  detectedCharacters?: string[];
  detectedLocation?: string;
  detectedProps?: string[];
  detectedAction?: string;
  missingRequirements?: string[];
  contradictions?: string[];
  evidence?: string;
  protectedRegions?: ProtectedRegionBox[];
}

export interface SemanticCheckOptions {
  slotId: string;
  filename: string;
  expectedRole: string;
  roleSlug?: string;
  storyText?: string;
  prompt?: string;
  assembledScenePrompt?: string;
  imageBuffer: Buffer;
  mimeType: string;
  otherSlots?: Array<{ slotId: string; roleSlug: string; role: string }>;
  userConfirmedPaid?: boolean;
  visionProviderId?: string;
  visionProvider?: SemanticVisionProvider | null;
  /** The exact SHA-256 of imageBuffer — echoed back on the result so a
   *  later image swap can be detected as stale (see
   *  invalidateSemanticResultIfStale). Computed here if omitted. */
  imageSha256?: string;
  /** The scene's semantic contract (see greatAdventureSemanticContracts.ts)
   *  — required characters/action/location/props, continuity references,
   *  and forbidden substitutions, sent to the vision provider so it checks
   *  against the SAME contract the rest of the pipeline enforces, and
   *  echoed onto the result as boundContractFingerprint for invalidation. */
  requiredCharacters?: string[];
  requiredAction?: string;
  requiredLocation?: string;
  requiredProps?: string[];
  continuityContract?: string[];
  forbiddenSubstitutions?: string[];
  /** Identity/style/Scout fingerprints (see greatAdventureIdentityContract.ts
   *  and greatAdventureSecretMarkerContract.ts) — sent so the provider (and
   *  the fingerprint-invalidation logic here) can bind the check to the
   *  exact locked contract version in force when the image was generated. */
  identityStyleFingerprint?: string;
  secretMarkerFingerprint?: string;
}

export interface SemanticVisionProvider {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;
  readonly isPaid: boolean;
  readonly analysisMethod: SemanticAnalysisMethod;
  estimateCost(imageCount: number): {
    estimatedCostUsd?: number;
    operationCount: number;
    costDescription: string;
  };
  analyzeImage(options: SemanticCheckOptions): Promise<SemanticValidationResult>;
}

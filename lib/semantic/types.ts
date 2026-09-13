export type SemanticMatchStatus =
  | "MATCH"
  | "POSSIBLE_MISMATCH"
  | "NOT_CHECKED"
  | "CHECK_FAILED";

export type SemanticAnalysisMethod =
  | "external-vision-api"
  | "test-mock-vision"
  | "metadata-inspection"
  | "none";

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

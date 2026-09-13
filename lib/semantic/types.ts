export type SemanticMatchStatus =
  | "MATCH"
  | "POSSIBLE_MISMATCH"
  | "NOT_CHECKED"
  | "CHECK_FAILED";

export interface SemanticValidationResult {
  status: SemanticMatchStatus;
  slotId: string;
  filename: string;
  expectedRole: string;
  detectedContent: string;
  confidence: number;
  explanation: string;
  candidateSwapSlotId?: string;
  checkedAt: string;
  userApprovedManualOverride?: boolean;
}

export interface SemanticCheckOptions {
  slotId: string;
  filename: string;
  expectedRole: string;
  roleSlug: string;
  storyText: string;
  prompt: string;
  imageBuffer: Buffer;
  mimeType: string;
  otherSlots?: Array<{ slotId: string; roleSlug: string; role: string }>;
}

import type { EnhancementMethod, EnhancementStatus, ImageProvenanceMetadata } from "./provenance";
export type { EnhancementMethod, EnhancementStatus, ImageProvenanceMetadata };

export type ProviderClass = "real-ai" | "local-ai" | "resampling" | "test-mock";

export interface EnhancementCostEstimate {
  estimatedCostUsd?: number;
  operationCount: number;
  costDescription: string;
  isPaid: boolean;
}

export interface EnhancementReceiptPayload {
  receiptId: string;
  slotId: string;
  bookId?: string;
  profileId: string;
  layoutMode: string;
  originalSha256: string;
  originalPixelDimensions: { width: number; height: number };
  enhancedSha256: string;
  enhancedPixelDimensions: { width: number; height: number };
  destinationDimensions?: { width: number; height: number };
  trustedProviderId: string;
  providerClass: ProviderClass;
  nativeEffectivePpi: number;
  enhancedEffectivePpi: number;
  createdAt: string;
  expiresAt: string;
}

export interface SignedEnhancementReceipt {
  payload: EnhancementReceiptPayload;
  signature: string;
}

export interface EnhanceImageOptions {
  inputBuffer: Buffer;
  mimeType: string;
  filename?: string;
  slotId?: string;
  bookId?: string;
  profileId?: string;
  layoutMode?: string;
  sourceDimensions: { width: number; height: number };
  targetDimensions: { width: number; height: number };
  physicalInches: { width: number; height: number };
  method?: EnhancementMethod;
  userConfirmedPaid?: boolean;
}

export interface EnhanceImageResult {
  enhancedBuffer: Buffer;
  mimeType: string;
  outputDimensions: { width: number; height: number };
  method: EnhancementMethod;
  providerClass: ProviderClass;
  upscaleFactor: number;
  provenance: ImageProvenanceMetadata;
  receipt?: SignedEnhancementReceipt;
}

export interface ResolutionEnhancementProvider {
  readonly id: string;
  readonly name: string;
  readonly providerClass: ProviderClass;
  readonly isConfigured: boolean;
  readonly isPaid: boolean;
  estimateCost(imageCount: number): EnhancementCostEstimate;
  enhanceImage(options: EnhanceImageOptions): Promise<EnhanceImageResult>;
}

export interface BatchItemStatus {
  index: number;
  slotId: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progressPct: number;
  result?: EnhanceImageResult;
  error?: string;
}

export interface BatchProgressReport {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  inProgress: number;
  items: BatchItemStatus[];
  isFinished: boolean;
}

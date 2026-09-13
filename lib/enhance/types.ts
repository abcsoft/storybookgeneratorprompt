import type { EnhancementMethod, EnhancementStatus, ImageProvenanceMetadata } from "./provenance";

export interface EnhancementCostEstimate {
  estimatedCostUsd?: number;
  operationCount: number;
  costDescription: string;
  isPaid: boolean;
}

export interface EnhanceImageOptions {
  inputBuffer: Buffer;
  mimeType: string;
  filename?: string;
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
  upscaleFactor: number;
  provenance: ImageProvenanceMetadata;
}

export interface ResolutionEnhancementProvider {
  readonly id: string;
  readonly name: string;
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

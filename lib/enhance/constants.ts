/**
 * Canonical Enhancement Provider IDs and Classifications.
 * Defined once and reused across registry, provider classes, API routes,
 * UI components, provenance records, and signed receipts.
 */
export const ENHANCEMENT_PROVIDER_IDS = {
  LOCAL_REALESRGAN: "local-realesrgan",
  EXTERNAL_AI: "external-ai-super-res",
  MOCK_AI: "mocked-ai-super-res",
  RESAMPLED: "resampled",
} as const;

export type CanonicalProviderId =
  (typeof ENHANCEMENT_PROVIDER_IDS)[keyof typeof ENHANCEMENT_PROVIDER_IDS];

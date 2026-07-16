/**
 * Thin wrapper around the Gemini image model (Nano Banana 2).
 *
 * Given a text prompt plus reference photos of the child, it returns the bytes
 * of a single generated illustration. Reference photos are passed as inline
 * image parts so the model preserves the child's likeness across the book.
 *
 * Requests use the configured service tier (default "flex" — ~50% cheaper but
 * slower/best-effort). Because the image model isn't on the documented flex
 * list, a flex request that keeps failing falls back to the standard tier so a
 * page never silently ends up blank just because flex was unavailable.
 */

import { GoogleGenAI, ServiceTier, type Part } from "@google/genai";
import {
  ASPECT_SINGLE,
  GEMINI_MODEL,
  IMAGE_SIZE,
  PAGE_RETRIES,
  REQUEST_TIMEOUT_MS,
  SERVICE_TIER,
  getApiKey,
} from "../config";
import type { ReferencePhoto } from "../story/types";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: getApiKey(),
      // Flex requests can sit in a queue for minutes; give them room so the SDK
      // doesn't close the connection early.
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
  }
  return client;
}

const TIER_MAP: Record<string, ServiceTier> = {
  flex: ServiceTier.FLEX,
  standard: ServiceTier.STANDARD,
  priority: ServiceTier.PRIORITY,
  unspecified: ServiceTier.UNSPECIFIED,
};
/** The configured service tier (defaults to flex). */
const PRIMARY_TIER: ServiceTier = TIER_MAP[SERVICE_TIER] ?? ServiceTier.FLEX;

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate one illustration. Retries transient failures with backoff on the
 * configured tier; if that tier is flex and all retries fail, makes one final
 * attempt on the standard tier before throwing.
 */
export async function generateIllustration(
  prompt: string,
  photos: ReferencePhoto[],
  aspectRatio: string = ASPECT_SINGLE,
): Promise<GeneratedImage> {
  const ai = getClient();

  const parts: Part[] = [{ text: prompt }];
  for (const photo of photos) {
    parts.push({ inlineData: { mimeType: photo.mimeType, data: photo.base64 } });
  }

  // Attempt the configured tier (PAGE_RETRIES + 1 times), then — only if it's
  // flex — one standard-tier fallback so an unsupported/preempted flex request
  // still yields an image.
  const tiers: ServiceTier[] = Array(PAGE_RETRIES + 1).fill(PRIMARY_TIER);
  if (PRIMARY_TIER === ServiceTier.FLEX) tiers.push(ServiceTier.STANDARD);

  let lastError: unknown;
  for (let attempt = 0; attempt < tiers.length; attempt++) {
    const serviceTier = tiers[attempt];
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["Image"],
          imageConfig: {
            aspectRatio,
            imageSize: IMAGE_SIZE,
          },
          serviceTier,
        },
      });

      const imagePart = response.candidates
        ?.at(0)
        ?.content?.parts?.find((p) => p.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        const text = response.text ? ` Model said: "${response.text}"` : "";
        throw new Error(`Gemini returned no image.${text}`);
      }

      if (serviceTier !== PRIMARY_TIER) {
        console.warn(
          `[gemini] '${PRIMARY_TIER}' tier unavailable — image generated on ` +
            `'${serviceTier}'.`,
        );
      } else {
        console.log(`[gemini] image generated on '${serviceTier}' tier.`);
      }

      return {
        data: Buffer.from(imagePart.inlineData.data, "base64"),
        mimeType: imagePart.inlineData.mimeType ?? "image/png",
      };
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[gemini] '${serviceTier}' attempt ${attempt + 1}/${tiers.length} ` +
          `failed: ${msg.slice(0, 200)}`,
      );
      if (attempt < tiers.length - 1) {
        await sleep(500 * 2 ** Math.min(attempt, 4)); // 0.5s, 1s, 2s, 4s, …
      }
    }
  }

  throw new Error(
    `Failed to generate illustration after ${tiers.length} attempts: ` +
      `${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

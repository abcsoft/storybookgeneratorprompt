/**
 * Photo preprocessing: downscale and normalize uploaded photos before sending
 * them to Gemini as reference images. Keeps payloads small and consistent.
 */

import sharp from "sharp";
import { MAX_REFERENCE_PHOTOS, REFERENCE_PHOTO_MAX_EDGE } from "../config";
import type { ReferencePhoto } from "../story/types";

/** Downscale one photo to a sane size and return base64 JPEG for Gemini. */
export async function preparePhoto(input: Buffer): Promise<ReferencePhoto> {
  const jpeg = await sharp(input)
    .rotate() // honor EXIF orientation
    .resize(REFERENCE_PHOTO_MAX_EDGE, REFERENCE_PHOTO_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer();

  return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
}

/**
 * Prepare a batch of uploaded photos, capping at the model's reference-image
 * limit. Throws if no usable photos are provided.
 */
export async function preparePhotos(inputs: Buffer[]): Promise<ReferencePhoto[]> {
  const capped = inputs.slice(0, MAX_REFERENCE_PHOTOS);
  const prepared = await Promise.all(capped.map(preparePhoto));
  if (prepared.length === 0) {
    throw new Error("At least one photo is required.");
  }
  return prepared;
}

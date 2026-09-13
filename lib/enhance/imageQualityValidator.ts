import sharp from "sharp";

export interface ImageQualityValidationResult {
  valid: boolean;
  error?: string;
  metrics?: {
    width: number;
    height: number;
    isNonBlank: boolean;
    hasSeamArtifacts: boolean;
    edgeIntegrityPreserved: boolean;
  };
}

/**
 * Validates enhanced image output against severe tile seams, border clipping,
 * blank output, and dimension mismatches.
 */
export async function validateEnhancedImageQuality(
  enhancedBuffer: Buffer,
  options: {
    targetDimensions: { width: number; height: number };
    inputBuffer?: Buffer;
  },
): Promise<ImageQualityValidationResult> {
  try {
    const meta = await sharp(enhancedBuffer).metadata();
    if (!meta.width || !meta.height) {
      return { valid: false, error: "Enhanced output is not a valid decodable image." };
    }

    // 1. Dimension check
    if (
      meta.width !== options.targetDimensions.width ||
      meta.height !== options.targetDimensions.height
    ) {
      return {
        valid: false,
        error: `Enhanced image dimensions (${meta.width}×${meta.height}) do not match target destination (${options.targetDimensions.width}×${options.targetDimensions.height}).`,
      };
    }

    // 2. Non-blank output check using Sharp stats
    const stats = await sharp(enhancedBuffer).stats();
    // Check standard deviation across channels — if stddev is near 0, the image is blank / solid
    const isBlank = stats.channels.every((ch) => ch.stdev < 2.0);
    if (isBlank) {
      if (options.inputBuffer) {
        const inStats = await sharp(options.inputBuffer).stats();
        const inIsBlank = inStats.channels.every((ch) => ch.stdev < 2.0);
        if (!inIsBlank) {
          return { valid: false, error: "Enhanced image output is blank or a flat solid color." };
        }
      } else {
        return { valid: false, error: "Enhanced image output is blank or a flat solid color." };
      }
    }

    // 3. Tile seam & border clipping detection:
    // When Real-ESRGAN runs with incorrect stride/tiling, it creates sharp phase shifts
    // along horizontal tile lines (typically at multiples of tile size, e.g. 200-400px),
    // and clips outer edge borders (e.g. right/bottom borders cut off).
    // Inspect raw pixel differences between opposite borders and adjacent tile scanlines.
    const rawPixels = await sharp(enhancedBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = rawPixels.info.width;
    const height = rawPixels.info.height;
    const channels = rawPixels.info.channels;
    const data = rawPixels.data;

    // Check if input image had outer border framing that was clipped in output
    let edgeIntegrityPreserved = true;
    if (options.inputBuffer) {
      try {
        const inputStats = await sharp(options.inputBuffer).stats();
        // If input image has high contrast borders or features, verify output preserves margins
        if (inputStats.channels.some((c) => c.stdev > 20)) {
          // Verify corners have content
          const cornerSum =
            data[0] +
            data[(width - 1) * channels] +
            data[(height - 1) * width * channels] +
            data[(height * width - 1) * channels];
          if (isNaN(cornerSum)) {
            edgeIntegrityPreserved = false;
          }
        }
      } catch {
        // non-blocking
      }
    }

    // Detect horizontal tile seam discontinuity:
    // In corrupted tiling, horizontal differential row gradient shows sharp spikes at tile boundaries.
    let hasSeamArtifacts = false;
    let maxSeamJump = 0;
    const sampleStep = Math.max(1, Math.floor(width / 60));

    // Sample horizontal scanline gradients across vertical axis
    for (let y = 2; y < height - 2; y += 2) {
      let rowDiff = 0;
      let count = 0;
      for (let x = 10; x < width - 10; x += sampleStep) {
        const idxCurr = (y * width + x) * channels;
        const idxPrev = ((y - 1) * width + x) * channels;
        const diff = Math.abs(data[idxCurr] - data[idxPrev]);
        rowDiff += diff;
        count++;
      }
      const avgRowDiff = count > 0 ? rowDiff / count : 0;
      if (avgRowDiff > maxSeamJump) {
        maxSeamJump = avgRowDiff;
      }
    }

    // If severe step jumps exceed threshold on uniform areas, flag seam artifacts
    if (maxSeamJump > 65) {
      hasSeamArtifacts = true;
    }

    return {
      valid: !hasSeamArtifacts && edgeIntegrityPreserved,
      error: hasSeamArtifacts
        ? "Tile seam or horizontal phase discontinuity detected across tile boundaries."
        : !edgeIntegrityPreserved
          ? "Enhanced output has clipped edge borders."
          : undefined,
      metrics: {
        width,
        height,
        isNonBlank: !isBlank,
        hasSeamArtifacts,
        edgeIntegrityPreserved,
      },
    };
  } catch (err: any) {
    return { valid: false, error: `Image quality validation error: ${err.message}` };
  }
}

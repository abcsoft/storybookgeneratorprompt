/**
 * Central configuration for the storybook generator.
 *
 * Everything tunable lives here: the Gemini model, print dimensions, generation
 * concurrency, and the shared art-style preamble used for every illustration.
 */

/** Nano Banana 2 — Gemini's image generation model.
 *  Confirm the exact id (incl. any `-preview` suffix) at
 *  https://ai.google.dev/gemini-api/docs/image-generation */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-image";

/** API key is read at call time so tests/builds don't require it. */
export function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see sample.env).",
    );
  }
  return key;
}

// ---- Print specification (landscape picture book) ----
/** Trim size of the book in inches (landscape). */
export const PAGE_WIDTH_IN = 11;
export const PAGE_HEIGHT_IN = 8;
/** Print resolution. */
export const DPI = 300;
/** Bleed added on every edge for print trimming. */
export const BLEED_INCHES = 0.125;
/** Aspect ratio for a single full-bleed landscape page. */
export const ASPECT_SINGLE = "3:2";
/** Aspect ratio for a two-page spread illustration (spans both leaves). */
export const ASPECT_SPREAD = "21:9";
/** Generated image size tier ("1K" | "2K" | "4K"). 2K balances quality vs cost. */
export const IMAGE_SIZE = process.env.IMAGE_SIZE ?? "2K";

// ---- Generation behaviour ----
/** How many illustrations to generate in parallel. Default 1 (one after another)
 *  to stay under image-model rate limits; raise via GEN_CONCURRENCY if your key
 *  has higher quota. */
export const GEN_CONCURRENCY = Number(process.env.GEN_CONCURRENCY ?? 1);
/** Per-page retry attempts before a page is marked failed. */
export const PAGE_RETRIES = 2;
/** Gemini 3 image models accept up to 14 reference images. */
export const MAX_REFERENCE_PHOTOS = 14;
/** Photos are downscaled to this longest edge (px) before upload. */
export const REFERENCE_PHOTO_MAX_EDGE = 1024;
/** Gemini service tier for image requests. "flex" is ~50% cheaper but slower and
 *  best-effort (1–15 min/request, can be preempted with 503s); "standard" is
 *  normal latency; "priority" is fastest/costliest. Override with
 *  GEMINI_SERVICE_TIER. Note: the image model may not honor flex, in which case
 *  the client falls back to standard. */
export const SERVICE_TIER = process.env.GEMINI_SERVICE_TIER ?? "flex";
/** Per-request HTTP timeout (ms). Flex requests can queue for minutes (Google
 *  recommends 600s+), so default to 15 minutes. Override with GEMINI_TIMEOUT_MS. */
export const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 900_000);

/**
 * Shared style preamble prepended to every illustration prompt so the whole
 * book looks like one cohesive picture book.
 */
export const ART_STYLE =
  "A high-end children's storybook picture in which THIS specific real child is " +
  "shown PHOTOREALISTICALLY — like an actual photograph of the real child placed " +
  "into a softly painted scene. " +
  "PHOTOREAL CHILD: render the child to look like a real photograph of the real " +
  "child — as if an actual photo of them were seamlessly composited into the " +
  "scene — with fully photographic skin (real texture and fine detail), eyes, " +
  "and hair; the child must NEVER look drawn, painted, illustrated, smoothed, or " +
  "cartoonish, and only the surrounding scenery may be softly painterly. " +
  "LIKENESS IS THE TOP PRIORITY: the attached reference photos show the real " +
  "child — reproduce that exact same real face precisely (same features, same " +
  "facial proportions, same skin tone, eye color, eyebrows, nose, mouth, and " +
  "hair) so it is unmistakably the SAME child in every picture. Keep the face " +
  "clearly visible, front-facing or three-quarter, and large enough to be " +
  "recognisable; even in a wide scene, do NOT let the face become tiny, turned " +
  "away, generic, or different from the references. " +
  "Render the child's face and skin PHOTOGRAPHICALLY, with true photographic " +
  "detail and texture; the face must look photographed, NEVER painted, " +
  "illustrated, smoothed, rounded, stylized, cartoonified, aged up, or beautified. " +
  "This is NOT a flat cartoon, vector, clip-art, coloring-book, anime, cel-shaded, " +
  "or 3D-animated (Pixar-style) illustration: avoid hard outlines, flat shading, " +
  "and garish saturated colors. Light, realistic painterly brushwork is fine for " +
  "the SURROUNDINGS, but the child stays crisply photographic; use realistic " +
  "directional lighting, gentle natural shadows, and true-to-life color. " +
  "The child must be lit by the scene's own light and cast shadows that match it, " +
  "so they genuinely belong in the scene and never look pasted-on or like a " +
  "realistic head on a cartoon body. " +
  "Use a shallow depth of field: the child is the sharp, crisp, photographic focal " +
  "point seen from a natural angle, while the background falls gently into soft, " +
  "painterly focus. " +
  "FRAMING: show the child as a natural medium shot from a slight distance — head " +
  "TOGETHER WITH the upper body and arms visible and active within the scene, at a " +
  "believable scale (like a real young child playing in the scene). Do NOT crop in " +
  "tight on the face. " +
  "PROPORTIONS: use realistic, true-to-life body proportions for a young child — " +
  "the head is roughly one-fifth to one-sixth of the standing height and sits " +
  "naturally on a correctly sized body. The head must NOT be enlarged, puffy, " +
  "overly round, or 'bubbly': absolutely no big-head, bobblehead, chibi, funko, or " +
  "caricature look, and the face must never appear larger than it should relative " +
  "to the body. " +
  "ANATOMY: correct human anatomy only — exactly two arms and two hands (five " +
  "fingers each) and two legs; never add a third arm or hand, and never duplicate, " +
  "merge, or distort limbs or fingers. When the child holds the puppy, it is " +
  "cradled in the child's own two hands/arms only — no extra hand appears. " +
  "Wide landscape composition that leaves some calm, softly-focused background " +
  "space (especially toward the lower-left), where a short line of text will be " +
  "added later by the layout software. " +
  "ABSOLUTELY NO TEXT IN THE IMAGE: this illustration has no text layer. Do NOT " +
  "paint, write, or render the story text, a caption, the child's name, a title, " +
  "or ANY letters, words, numbers, sentences, or gibberish/unreadable lettering " +
  "anywhere in the picture — and no writing on maps, scrolls, banners, signs, " +
  "posters, wall-hangings, books, or clothing (leave every such surface blank). " +
  "The lower-left area must be clean, empty background with no lettering at all. " +
  "No watermarks, signatures, logos, frames, or borders. " +
  "Warm, friendly, and safe for young children.";

// The character-reference ("00-character.png") prompt lives in
// lib/story/prompt/characterAnchor.ts — it's shared by every book, not
// specific to any one template, so it doesn't belong in per-story files or
// this general config.

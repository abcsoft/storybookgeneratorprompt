/**
 * Centralized locators for the Gemini web UI (gemini.google.com).
 *
 * ⚠️ The Gemini web app ships obfuscated, frequently-changing markup, so every
 * element is described as an ORDERED LIST OF CANDIDATES. `resolve()` in
 * `geminiWeb.ts` tries each in turn and uses the first that is visible. When
 * Google changes the UI, this is the ONE file to update — run a discovery pass
 * with `npx playwright codegen https://gemini.google.com` (using the persistent
 * profile so you're logged in) and prepend the new locator to the relevant list.
 *
 * Prefer role / accessible-name / placeholder candidates over brittle CSS class
 * names; keep CSS fallbacks last.
 */

/** A single way to find an element. Exactly one strategy field should be set. */
export interface LocatorCandidate {
  /** Accessible role + optional accessible name (most stable). */
  role?: { role: AriaRole; name?: string | RegExp; exact?: boolean };
  /** aria-label / associated <label> text. */
  label?: string | RegExp;
  /** Placeholder text (for inputs / contenteditable data-placeholder). */
  placeholder?: string | RegExp;
  /** Visible text content. */
  text?: string | RegExp;
  /** Raw CSS selector — last-resort fallback. */
  css?: string;
}

/** ARIA roles we reference (kept narrow for type-safety). */
export type AriaRole =
  | "button"
  | "textbox"
  | "menuitem"
  | "menuitemcheckbox"
  | "img"
  | "link"
  | "menu";

export interface GeminiSelectors {
  /** The prompt composer (a contenteditable rich-text box). */
  composer: LocatorCandidate[];
  /** The send / submit control. */
  submit: LocatorCandidate[];
  /** Button that opens the attach/upload menu (the "+" control). */
  attachButton: LocatorCandidate[];
  /** "Create image" tool toggle in the Upload & tools menu (menuitemcheckbox). */
  createImageToggle: LocatorCandidate[];
  /** The model/mode picker button next to the composer ("currently <model>"). */
  modePicker: LocatorCandidate[];
  /** Menu item that triggers a local-file upload (reveals the file input). */
  uploadFilesMenuItem: LocatorCandidate[];
  /** The hidden <input type="file"> used for uploads. */
  fileInput: LocatorCandidate[];
  /** "New chat" / "New conversation" control. */
  newChat: LocatorCandidate[];
  /**
   * Optional aspect-ratio control. The standard Gemini UI may NOT expose one;
   * if none resolves, `setAspect` falls back to appending the ratio to the
   * prompt text. Confirm during the discovery pass.
   */
  aspectControl: LocatorCandidate[];
  /** The most recently generated image in the latest model response. */
  generatedImage: LocatorCandidate[];
  /** Download / save control for a generated image (often revealed on hover). */
  downloadButton: LocatorCandidate[];
  /**
   * Marker that the app shell has loaded (the composer). NOTE: this is present
   * even when logged OUT, so `isLoggedIn` also requires `signInButton` to be
   * absent.
   */
  loggedInMarker: LocatorCandidate[];
  /** "Sign in" control — visible only when logged OUT (the reliable signal). */
  signInButton: LocatorCandidate[];
}

export const SELECTORS: GeminiSelectors = {
  composer: [
    { role: { role: "textbox", name: /prompt|message|ask gemini/i } },
    { label: /enter a prompt|ask gemini|message gemini/i },
    { css: "div.ql-editor[contenteditable='true']" },
    { css: "rich-textarea div[contenteditable='true']" },
    { css: "[contenteditable='true'][role='textbox']" },
  ],
  submit: [
    { role: { role: "button", name: /send|submit/i } },
    { label: /send message|send/i },
    { css: "button[aria-label*='Send' i]" },
    { css: "button.send-button" },
  ],
  attachButton: [
    // Observed live: the "+" control is labelled "Upload & tools".
    { role: { role: "button", name: /upload & tools|add files|upload|attach/i } },
    { label: /upload & tools|add files|upload file|attach/i },
    { css: "button[aria-label*='Upload' i]" },
    { css: "button[aria-label*='attach' i]" },
  ],
  uploadFilesMenuItem: [
    { role: { role: "menuitem", name: /upload files?|upload image|from device|computer/i } },
    { text: /upload files?|upload image|from your device/i },
  ],
  createImageToggle: [
    // Observed live: a menuitemcheckbox labelled "Create image" (aria-checked).
    { role: { role: "menuitemcheckbox", name: /create image/i } },
  ],
  modePicker: [
    // Observed live: aria-label like "Open mode picker, currently 3.1 Pro".
    { role: { role: "button", name: /mode picker|currently/i } },
  ],
  fileInput: [
    { css: "input[type='file']" },
  ],
  newChat: [
    { role: { role: "button", name: /new chat|new conversation/i } },
    { role: { role: "link", name: /new chat|new conversation/i } },
    { label: /new chat|new conversation/i },
    { css: "[aria-label*='New chat' i]" },
  ],
  aspectControl: [
    { role: { role: "button", name: /aspect ratio|aspect/i } },
    { label: /aspect ratio/i },
  ],
  generatedImage: [
    // Observed live: generated images carry alt text ending "AI generated".
    // (Avatars/icons live on googleusercontent — do NOT match those.)
    { css: "img[alt*='AI generated' i]" },
    { css: "img[src^='blob:']" },
  ],
  downloadButton: [
    // Observed live: the response toolbar button is "Download full size image".
    { role: { role: "button", name: /download full size image/i } },
    { role: { role: "button", name: /download|save image/i } },
    { label: /download/i },
  ],
  loggedInMarker: [
    { role: { role: "textbox", name: /prompt|message|ask gemini/i } },
    { css: "div.ql-editor[contenteditable='true']" },
    { css: "[contenteditable='true'][role='textbox']" },
    { css: "rich-textarea div[contenteditable='true']" },
  ],
  signInButton: [
    { role: { role: "button", name: /^\s*sign in\s*$/i } },
    { role: { role: "link", name: /^\s*sign in\s*$/i } },
    { label: /^\s*sign in\s*$/i },
  ],
};

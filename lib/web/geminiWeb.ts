/**
 * Playwright automation layer for generating images on gemini.google.com using
 * a logged-in Pro plan (free), instead of the paid Gemini API.
 *
 * Design notes / why it's shaped this way:
 * - A PERSISTENT Chrome profile (channel: "chrome") reuses a real, manually
 *   logged-in Google session. We never automate the Google login itself —
 *   Google blocks that. `ensureLoggedIn` pauses for a one-time manual login.
 * - The Gemini DOM is volatile, so every element comes from `selectors.ts` as
 *   an ordered candidate list resolved by `resolveVisible`.
 * - Pages are generated in ONE chat (the anchor + reference photos stay in
 *   context), so to grab the right image we count existing images before a
 *   submit and wait for the count to grow.
 * - Downloading prefers the UI's download control (full-res); if that isn't
 *   found it falls back to fetching the rendered <img> bytes.
 *
 * ⚠️ Automating the Gemini web app to avoid API billing likely violates
 * Google's Terms of Service. Use a disposable/secondary account if possible.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";
import { SELECTORS, type LocatorCandidate } from "./selectors";

const APP_URL = "https://gemini.google.com/app";

/**
 * CSS used to count/select generated images. Deliberately the precise
 * alt-based marker only — blob:/googleusercontent also match avatars and
 * attachment thumbnails, which would corrupt the "new image" count.
 */
const IMAGE_UNION_CSS = "img[alt*='AI generated' i]";

export interface GeminiWebOptions {
  /** Chrome user-data-dir holding the persistent (manually logged-in) session. */
  userDataDir: string;
  /** Run with a visible window (required for the first manual login). */
  headless?: boolean;
  /** Per-action delay (ms) for more human-like pacing / less detection. */
  slowMo?: number;
  /** Timeout for navigation and element resolution (ms). */
  navTimeoutMs?: number;
  /** How long to wait for an image after submitting a prompt (ms). */
  generateTimeoutMs?: number;
  /** How long to wait for the one-time manual Google login (ms). */
  loginTimeoutMs?: number;
  /**
   * Model to pick in the composer's mode picker, matched as a substring of the
   * option label, e.g. "3.1 Flash-Lite" or "3.1 Pro". Empty = leave as-is.
   */
  model?: string;
}

/** Result of a single generation. */
export interface GenerateResult {
  /** Absolute path the image was written to. */
  savedPath: string;
}

export class GeminiWebSession {
  private context?: BrowserContext;
  private page?: Page;
  private readonly opts: Required<GeminiWebOptions>;

  constructor(opts: GeminiWebOptions) {
    this.opts = {
      headless: false,
      slowMo: 80,
      navTimeoutMs: 30_000,
      generateTimeoutMs: 240_000,
      loginTimeoutMs: 300_000,
      model: "",
      ...opts,
    };
  }

  /** Launch the persistent Chrome context. */
  async open(): Promise<void> {
    try {
      this.context = await chromium.launchPersistentContext(
        this.opts.userDataDir,
        {
          headless: this.opts.headless,
          channel: "chrome", // use the system-installed Chrome, not bundled chromium
          viewport: null,
          acceptDownloads: true,
          slowMo: this.opts.slowMo,
          args: ["--disable-blink-features=AutomationControlled"],
        },
      );
    } catch (err) {
      throw new Error(
        `Could not launch Chrome. Make sure Google Chrome is installed, or run ` +
          `\`npx playwright install chromium\` and remove channel:"chrome".\n` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.page.setDefaultTimeout(this.opts.navTimeoutMs);
  }

  /**
   * Navigate to Gemini and ensure we're logged in. On the first run this waits
   * for you to log in manually in the open Chrome window (polling until the
   * prompt box appears); the session then persists in the profile for next time.
   */
  async ensureLoggedIn(): Promise<void> {
    const page = this.requirePage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

    if (await this.isLoggedIn(8_000)) {
      console.log("✓ Already logged in.");
      return;
    }

    if (this.opts.headless) {
      throw new Error(
        "Not logged in and running headless. Re-run with a visible window " +
          "(--headful) once to log into Google, then headless will reuse the session.",
      );
    }

    const minutes = Math.round(this.opts.loginTimeoutMs / 60_000);
    console.log(
      `\n👤 A Chrome window has opened. Log into your Google account there.\n` +
        `   Waiting up to ${minutes} min for Gemini's prompt box to appear…`,
    );
    const deadline = Date.now() + this.opts.loginTimeoutMs;
    while (Date.now() < deadline) {
      if (await this.isLoggedIn(3_000)) {
        console.log("✓ Logged in.");
        return;
      }
      await page.waitForTimeout(2_500);
    }
    throw new Error("Timed out waiting for Google login.");
  }

  /**
   * Start a fresh chat by fully reloading the app. A hard reload (rather than
   * clicking "New chat") guarantees a clean document, so a stuck or failed
   * previous page — e.g. a generation that hung — can't poison the next one.
   */
  async newChat(): Promise<void> {
    const page = this.requirePage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await this.resolveVisible(SELECTORS.composer, this.opts.navTimeoutMs);
  }

  /**
   * Attach local files to the next prompt. Tries to set files directly on a
   * hidden <input type=file>; otherwise opens the upload menu and feeds the
   * native file chooser.
   */
  async attachFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    const page = this.requirePage();

    // Fast path: a hidden <input type=file> already in the DOM.
    const existing = page.locator("input[type='file']").first();
    if ((await existing.count()) > 0) {
      await existing.setInputFiles(filePaths);
      await this.waitForAttachmentsSettled();
      return;
    }

    // Otherwise open the Upload & tools menu and pick "Upload files". That may
    // open a native file chooser AND/OR reveal a hidden input — handle either,
    // since relying on the chooser event alone proved flaky.
    const chooserPromise = page
      .waitForEvent("filechooser", { timeout: 15_000 })
      .catch(() => null);
    const attach = await this.resolveVisible(SELECTORS.attachButton, this.opts.navTimeoutMs);
    await attach.click();
    const menuItem = await this.tryResolve(SELECTORS.uploadFilesMenuItem, 4_000);
    if (menuItem) await menuItem.click();

    const chooser = await chooserPromise;
    if (chooser) {
      await chooser.setFiles(filePaths);
    } else {
      // No chooser fired — poll for a hidden input that may have appeared.
      let input = page.locator("input[type='file']").first();
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline && (await input.count()) === 0) {
        await page.waitForTimeout(300);
        input = page.locator("input[type='file']").first();
      }
      if ((await input.count()) === 0) {
        throw new Error("Could not find a file input or chooser to attach photos.");
      }
      await input.setInputFiles(filePaths);
    }
    await this.waitForAttachmentsSettled();
  }

  /**
   * Select a model in the composer's mode picker (e.g. "3.1 Flash-Lite").
   * No-op if the current selection already matches (cheap — just reads the
   * picker's aria-label). Best-effort.
   */
  async selectModel(label: string): Promise<void> {
    if (!label) return;
    const page = this.requirePage();
    const picker = await this.tryResolve(SELECTORS.modePicker, 6_000);
    if (!picker) return;
    const current = (await picker.getAttribute("aria-label").catch(() => "")) ?? "";
    if (current.toLowerCase().includes(label.toLowerCase())) return; // already set

    await picker.click();
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const opt = page.getByRole("menuitem", { name: re }).first();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if ((await opt.count()) > 0 && (await opt.isVisible().catch(() => false))) {
        await opt.click().catch(() => {});
        break;
      }
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  }

  /**
   * Turn on the "Create image" tool in the Upload & tools menu so Gemini
   * generates a picture (the composer enters "Images" mode). Idempotent: only
   * clicks the toggle when it isn't already checked. Best-effort — if the menu
   * or toggle can't be found, it leaves things as-is and returns.
   */
  async enableCreateImageMode(): Promise<void> {
    const page = this.requirePage();
    const attach = await this.tryResolve(SELECTORS.attachButton, 6_000);
    if (!attach) return;
    await attach.click();

    const toggle = await this.tryResolve(SELECTORS.createImageToggle, 4_000);
    if (toggle) {
      const checked = await toggle.getAttribute("aria-checked").catch(() => null);
      if (checked !== "true") {
        await toggle.click().catch(() => {});
      }
    }
    // Close the menu so it doesn't cover the composer.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }

  /**
   * Try to set the aspect ratio via the UI. Returns true if applied, false if
   * no control was found (caller should then bake the ratio into the prompt).
   */
  async trySetAspect(aspect: string): Promise<boolean> {
    const control = await this.tryResolve(SELECTORS.aspectControl, 3_000);
    if (!control) return false;
    try {
      await control.click();
      const page = this.requirePage();
      const option = page.getByText(aspect, { exact: false }).first();
      if (await option.isVisible()) {
        await option.click();
        return true;
      }
    } catch {
      /* fall through to prompt-append */
    }
    return false;
  }

  /** Type a prompt into the composer and submit it. */
  async submitPrompt(text: string): Promise<void> {
    const page = this.requirePage();
    const composer = await this.resolveVisible(SELECTORS.composer, this.opts.navTimeoutMs);
    await composer.click();
    await composer.fill(text);
    const submit = await this.tryResolve(SELECTORS.submit, 4_000);
    if (submit) {
      await submit.click();
    } else {
      await page.keyboard.press("Enter");
    }
  }

  /**
   * High-level: attach files, set/append aspect, submit prompt, wait for the
   * resulting image, and download it to `<destDir>/<baseName>.<ext>`.
   * Returns the path actually written (extension chosen from the download).
   */
  async generate(args: {
    prompt: string;
    files: string[];
    aspect: string;
    destDir: string;
    /** Filename without extension, e.g. "01" or "00-character". */
    baseName: string;
  }): Promise<GenerateResult> {
    // Pick the requested model, then turn on the "Create image" tool.
    await this.selectModel(this.opts.model);
    await this.enableCreateImageMode();
    await this.attachFiles(args.files);
    const aspectApplied = await this.trySetAspect(args.aspect);
    // Append the aspect ratio only if the UI exposed no control (it doesn't).
    const aspectNote = aspectApplied ? "" : ` (Aspect ratio: ${args.aspect}.)`;
    const prompt = `${args.prompt}${aspectNote}`;

    const before = await this.countImages();
    await this.submitPrompt(prompt);
    await this.waitForNewImage(before);
    const savedPath = await this.downloadLatestImage(args.destDir, args.baseName);
    return { savedPath };
  }

  /** Close the browser context. */
  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private requirePage(): Page {
    if (!this.page) throw new Error("Session not open — call open() first.");
    return this.page;
  }

  private async isLoggedIn(timeoutMs = 5_000): Promise<boolean> {
    // Wait for the app shell (composer) so the page has actually loaded…
    const marker = await this.tryResolve(SELECTORS.loggedInMarker, timeoutMs);
    if (!marker) return false;
    // …then we're logged in only if no "Sign in" control is showing (the
    // composer is present even on the logged-out landing page).
    const signIn = await this.tryResolve(SELECTORS.signInButton, 1_500);
    return signIn === null;
  }

  private imagesLocator(): Locator {
    return this.requirePage().locator(IMAGE_UNION_CSS || "img");
  }

  private async countImages(): Promise<number> {
    try {
      return await this.imagesLocator().count();
    } catch {
      return 0;
    }
  }

  /** Wait until a new generated image appears (count grows past `before`). */
  private async waitForNewImage(before: number): Promise<void> {
    const deadline = Date.now() + this.opts.generateTimeoutMs;
    const page = this.requirePage();
    while (Date.now() < deadline) {
      if ((await this.countImages()) > before) {
        // Let the high-res render settle before downloading.
        await page.waitForTimeout(1_500);
        return;
      }
      await page.waitForTimeout(1_000);
    }
    throw new Error(
      `Timed out after ${Math.round(this.opts.generateTimeoutMs / 1000)}s waiting ` +
        `for a generated image (no new image appeared).`,
    );
  }

  /**
   * Download the most recent image. Prefers the UI download control (full
   * resolution); falls back to fetching the rendered <img> bytes.
   */
  private async downloadLatestImage(
    destDir: string,
    baseName: string,
  ): Promise<string> {
    const page = this.requirePage();

    // Strategy 1: the "Download full size image" button (full resolution).
    // Use the LAST matching button so we never grab an earlier image's control.
    const dl = page
      .getByRole("button", { name: /download full size image|download|save image/i })
      .last();
    // The button mounts only when the response is fully complete (for a complex
    // illustration, well after the image first renders). Wait for it, click, and
    // if the click doesn't yield a download, wait 10s and try again.
    const DOWNLOAD_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
      const waitMs = attempt === 1 ? this.opts.generateTimeoutMs : 15_000;
      const deadline = Date.now() + waitMs;
      let dlReady = false;
      while (Date.now() < deadline) {
        if ((await dl.count()) > 0 && (await dl.isVisible().catch(() => false))) {
          dlReady = true;
          break;
        }
        await page.waitForTimeout(500);
      }
      if (dlReady) {
        try {
          const latest = this.imagesLocator().last();
          await latest.scrollIntoViewIfNeeded().catch(() => {});
          await latest.hover().catch(() => {});
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 30_000 }),
            dl.click(),
          ]);
          const ext = extFromName(download.suggestedFilename()) ?? "png";
          const out = path.join(destDir, `${baseName}.${ext}`);
          await download.saveAs(out);
          return out;
        } catch {
          /* download didn't fire — wait and retry below */
        }
      }
      if (attempt < DOWNLOAD_ATTEMPTS) await page.waitForTimeout(10_000);
    }

    // Strategy 2: read the rendered image's bytes directly (last resort).
    const img = this.imagesLocator().last();
    const src = await img.getAttribute("src");
    if (!src) throw new Error("Found a generated image but it had no src to download.");

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      // NOTE: keep this evaluate callback free of named/assigned inner
      // functions — tsx/esbuild injects a `__name` helper that doesn't exist
      // in the page context, so FileReader-style handlers crash. Inline only.
      const dataUrl = src.startsWith("data:")
        ? src
        : await page.evaluate(async (s) => {
            const res = await fetch(s);
            const buf = new Uint8Array(await res.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
            const mime = res.headers.get("content-type") || "image/png";
            return "data:" + mime + ";base64," + btoa(bin);
          }, src);
      const { buffer, ext } = decodeDataUrl(dataUrl);
      const out = path.join(destDir, `${baseName}.${ext}`);
      await writeFile(out, buffer);
      return out;
    }

    // Remote URL — fetch via the browser context (carries auth cookies).
    const resp = await this.context!.request.get(src);
    if (!resp.ok()) {
      throw new Error(`Failed to fetch image ${src}: HTTP ${resp.status()}`);
    }
    const body = Buffer.from(await resp.body());
    const ext =
      extFromMime(resp.headers()["content-type"]) ?? extFromName(src) ?? "png";
    const out = path.join(destDir, `${baseName}.${ext}`);
    await writeFile(out, body);
    return out;
  }

  /** Give uploads a moment to register before we type/submit. */
  private async waitForAttachmentsSettled(): Promise<void> {
    await this.requirePage().waitForTimeout(1_500);
  }

  /** Resolve the first visible candidate, polling until timeout. Throws if none. */
  private async resolveVisible(
    candidates: LocatorCandidate[],
    timeoutMs: number,
  ): Promise<Locator> {
    const found = await this.tryResolve(candidates, timeoutMs);
    if (found) return found;
    throw new Error(
      `Could not find any of these UI elements (update lib/web/selectors.ts):\n` +
        candidates.map((c) => `  - ${describeCandidate(c)}`).join("\n"),
    );
  }

  /** Like resolveVisible but returns null instead of throwing on timeout. */
  private async tryResolve(
    candidates: LocatorCandidate[],
    timeoutMs: number,
  ): Promise<Locator | null> {
    const page = this.requirePage();
    const deadline = Date.now() + timeoutMs;
    do {
      for (const c of candidates) {
        const loc = buildLocator(page, c).first();
        try {
          if (await loc.isVisible()) return loc;
        } catch {
          /* candidate not present yet */
        }
      }
      await page.waitForTimeout(250);
    } while (Date.now() < deadline);
    return null;
  }
}

// ── pure helpers ─────────────────────────────────────────────────────────────

function buildLocator(page: Page, c: LocatorCandidate): Locator {
  if (c.role) return page.getByRole(c.role.role, { name: c.role.name, exact: c.role.exact });
  if (c.label) return page.getByLabel(c.label);
  if (c.placeholder) return page.getByPlaceholder(c.placeholder);
  if (c.text) return page.getByText(c.text);
  if (c.css) return page.locator(c.css);
  throw new Error("Empty locator candidate in selectors.ts");
}

function describeCandidate(c: LocatorCandidate): string {
  if (c.role) return `role=${c.role.role}${c.role.name ? ` name=${c.role.name}` : ""}`;
  if (c.label) return `label=${c.label}`;
  if (c.placeholder) return `placeholder=${c.placeholder}`;
  if (c.text) return `text=${c.text}`;
  if (c.css) return `css=${c.css}`;
  return "(empty)";
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function extFromMime(contentType?: string): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] ?? null;
}

function extFromName(name: string): string | null {
  const m = /\.(png|jpe?g|webp)(?:$|\?)/i.exec(name);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new Error("Unexpected data URL format for generated image.");
  const ext = extFromMime(m[1]) ?? "png";
  return { buffer: Buffer.from(m[2], "base64"), ext };
}

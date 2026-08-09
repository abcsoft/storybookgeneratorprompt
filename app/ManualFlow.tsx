"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProfileFields, { type Gender } from "./ProfileFields";
import IllustrationCard from "./IllustrationCard";
import CorrectionPanel from "./CorrectionPanel";
import BookReview from "./BookReview";
import ConfirmDialog from "./ConfirmDialog";
import { matchImportedFiles, type ImportMatchReport } from "@/lib/manual/importMatch";
import { checkImportedImage } from "@/lib/manual/clientImageCheck";
import { evaluateExportGate } from "@/lib/manual/exportGate";
import { buildReviewSequence } from "@/lib/manual/reviewOrder";
import {
  clearedIllustrations,
  collectObjectUrls,
  createGenerationGuard,
  emptyEntry,
  freshIllustrations,
  hasReviewDecisions,
  hasSessionWork,
  reviewResetIllustrations,
  type IllustrationEntry,
} from "@/lib/manual/sessionReset";
import type { PrintProfile } from "@/lib/print/types";
import { getEditionForProfile } from "@/lib/story/editions";
import type { ArtworkTransform } from "@/lib/print/artworkTransform";
import styles from "./page.module.css";

export type { IllustrationEntry };

import type { PageLayout } from "@/lib/story/types";

export interface ManualPage {
  illustrationNumber?: number;
  illustrationIndex?: number;
  page: number;
  index: number;
  kind: string;
  role?: string;
  filename: string;
  prompt: string;
  text: string;
  aspect: string;
  spread?: boolean;
  pageLayout?: PageLayout;
}

type Step = "profile" | "prompts" | "review";

interface PrintifyExportSummary {
  dir: string;
  files: string[];
  warnings: string[];
}

/** Which confirmation dialog (if any) is currently pending. Centralizing
 *  this as one piece of state — instead of a boolean per action — keeps the
 *  confirm/cancel wiring in one place (item 9). */
type PendingAction = "clear-images" | "reset-review" | "new-book" | "new-child" | null;

/** Free flow: get prompts, generate images yourself, import + review + fix,
 *  then build the PDF (or export a Printify-ready folder). */
export default function ManualFlow({
  bookId,
  profile,
  onSessionWorkChange,
}: {
  bookId: string;
  profile: PrintProfile;
  /** Reports whether this session currently has any imported/generated
   *  image, so the parent (Studio) can decide whether switching story needs
   *  a destructive-reset confirmation (item 5). Optional — AutoFlow-only
   *  usage doesn't need it. */
  onSessionWorkChange?: (hasWork: boolean) => void;
}) {
  const profileId = profile.id;
  const exportMode = profile.exportMode;

  const [step, setStep] = useState<Step>("profile");
  const [name, setName] = useState("");
  const [age, setAge] = useState("4");
  const [gender, setGender] = useState<Gender>("boy");

  const [pages, setPages] = useState<ManualPage[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [anchorPrompt, setAnchorPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [printifyResult, setPrintifyResult] = useState<PrintifyExportSummary | null>(null);

  const [illustrations, setIllustrations] = useState<Record<number, IllustrationEntry>>({});
  const [importReport, setImportReport] = useState<ImportMatchReport | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // The native file input, so a destructive reset can explicitly zero its
  // value — React state alone doesn't reliably reset the browser's own
  // file-selection value (the dropzone's own onChange already does this
  // after every change, but this makes it correct regardless of which code
  // path triggers a reset).
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Bumped by every destructive reset (Clear images, Start new book/New
  // child, a confirmed story change, a profile change that invalidates the
  // page layout). Every async image-check captures the generation it
  // started under and refuses to write its result back if the generation
  // has since moved on — a single, auditable kill-switch for ALL pending
  // decode/validation work at once, instead of relying only on scattered
  // per-file identity checks. See lib/manual/sessionReset.ts for the
  // (independently unit-tested) guard logic itself.
  const importGeneration = useRef(createGenerationGuard()).current;

  // Report session-work state upward (item 5) whenever it changes.
  useEffect(() => {
    onSessionWorkChange?.(hasSessionWork(illustrations));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [illustrations]);

  // Revoke any blob: object URLs on unmount so switching away from the
  // manual tab doesn't leak them for the rest of the page's lifetime.
  useEffect(() => {
    return () => {
      collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fetches the manifest for a given book/profile and replaces pages +
   *  illustrations wholesale — the shared core behind both the initial "Get
   *  my prompts" click and an in-session story change (item 5). Does NOT
   *  touch name/age/gender, so callers control what "child details" means
   *  for their situation. */
  async function fetchAndSetPrompts(
    targetBookId: string,
    targetProfileId: string,
  ): Promise<boolean> {
    if (!name.trim()) {
      setError("Please enter your child's name.");
      return false;
    }
    // Invalidate any in-flight image checks from whatever session existed
    // before this — a story change is a full asset reset (item 5).
    importGeneration.bump();
    setBusy(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          age,
          gender,
          bookId: targetBookId,
          profileId: targetProfileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not build prompts.");
        return false;
      }
      collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
      const nextPages = data.pages as ManualPage[];

      setPages(nextPages);
      setMarkdown(data.markdown);
      setAnchorPrompt(data.anchorPrompt ?? "");
      setIllustrations(freshIllustrations(nextPages.map((p) => p.index)));
      setImportReport(null);
      setPrintifyResult(null);
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function getPrompts() {
    setError(null);
    const ok = await fetchAndSetPrompts(bookId, profileId);
    if (ok) setStep("prompts");
  }

  // Story change (item 5): Studio.tsx confirms with the user BEFORE ever
  // changing the `bookId` prop, so by the time it actually changes here, the
  // destructive reset is already agreed to — just regenerate for the new
  // book, preserving whatever child details are already entered.
  const prevBookIdRef = useRef(bookId);
  useEffect(() => {
    if (prevBookIdRef.current === bookId) return;
    prevBookIdRef.current = bookId;
    if (pages.length === 0) return; // no session yet — nothing to migrate
    setCorrectionIndex(null);
    setError(null);
    void fetchAndSetPrompts(bookId, profileId).then((ok) => {
      if (ok) setStep("prompts");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Print profile change (item 6): never destroys images. Re-fetches the
  // manifest (only the per-page `aspect` actually differs across profiles
  // for the same book today) and re-runs the client-side aspect check for
  // every already-imported file against the new expected aspect. If a
  // future profile ever DID change the page/filename set, mappings that no
  // longer correspond to a real page are dropped and the user is warned —
  // never silently mismatched.
  const prevProfileIdRef = useRef(profileId);
  useEffect(() => {
    if (prevProfileIdRef.current === profileId) return;
    prevProfileIdRef.current = profileId;
    if (pages.length === 0) return; // nothing generated yet — nothing to resync
    void resyncForProfileChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function resyncForProfileChange() {
    setBusy(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), age, gender, bookId, profileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not refresh prompts for the new print profile.");
        return;
      }
      const nextPages = data.pages as ManualPage[];
      const oldFilenames = new Set(pages.map((p) => p.filename));
      const newFilenames = new Set(nextPages.map((p) => p.filename));
      const layoutChanged =
        oldFilenames.size !== newFilenames.size ||
        [...oldFilenames].some((f) => !newFilenames.has(f));

      setPages(nextPages);
      setMarkdown(data.markdown);
      setAnchorPrompt(data.anchorPrompt ?? "");

      if (layoutChanged) {
        // Defensive path — no two profiles change the page/filename set for
        // the same book today, but if one ever does, don't silently
        // mis-attach an old image to a different page.
        importGeneration.bump();
        collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
        setIllustrations(freshIllustrations(nextPages.map((p) => p.index)));
        setImportReport(null);
        setError("The new print profile changed the page layout — please re-import your images.");
      } else {
        const generation = importGeneration.current();
        for (const p of nextPages) {
          const currentFile = illustrations[p.index]?.file;
          if (!currentFile) continue;
          void checkImportedImage(currentFile, p.aspect).then((check) => {
            if (importGeneration.isStale(generation)) return; // reset meanwhile
            setIllustrations((cur) => {
              const current = cur[p.index];
              if (!current || current.file !== currentFile) return cur;
              return { ...cur, [p.index]: { ...current, clientCheck: check } };
            });
          });
        }
      }
    } catch {
      setError("Could not reach the server to refresh prompts for the new print profile.");
    } finally {
      setBusy(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prompts.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPrompt(text: string, page: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(page);
      setTimeout(() => setCopied((c) => (c === page ? null : c)), 1200);
    } catch {
      /* clipboard not available */
    }
  }

  function setEntry(index: number, entry: IllustrationEntry) {
    setIllustrations((cur) => {
      const prev = cur[index];
      if (prev?.objectUrl && prev.objectUrl !== entry.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      return { ...cur, [index]: entry };
    });
  }

  /** Run the (browser-only) client-side aspect check for one file in the
   *  background and fold the result into that page's entry once ready —
   *  never blocks the status transition itself (item 3 is a warning
   *  overlay, not a gate on "added"). Guarded two ways against a stale
   *  write: the `generation` this check started under must still be current
   *  (nothing destructive happened meanwhile), AND the page's file must
   *  still be this exact file (nothing individually replaced it meanwhile). */
  async function runClientCheck(index: number, file: File, generation: number) {
    const page = pages.find((p) => p.index === index);
    if (!page) return;
    const check = await checkImportedImage(file, page.aspect);
    if (importGeneration.isStale(generation)) return; // a reset happened meanwhile
    setIllustrations((cur) => {
      const current = cur[index];
      if (!current || current.file !== file) return cur; // superseded already
      return { ...cur, [index]: { ...current, clientCheck: check } };
    });
  }

  /** Assign or replace a file for a page — invalidates old transform metadata
   *  and clears regeneration flags, landing as "added". */
  function applyFile(index: number, file: File) {
    const objectUrl = URL.createObjectURL(file);
    setEntry(index, {
      status: "added",
      needsRegeneration: false,
      file,
      objectUrl,
      clientCheck: null,
      transform: undefined,
    });
    void runClientCheck(index, file, importGeneration.current());
  }

  /** Bulk import (item 2): match every selected file against the expected
   *  filenames and report exactly what matched, is missing, duplicated, or
   *  unmatched — nothing is silently dropped. Every matched file is assigned
   *  in ONE state update so the import report and the per-card status badges
   *  never visibly disagree; the (slower, per-file) aspect-ratio check then
   *  fills in warnings in the background. */
  function onBulkImport(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const report = matchImportedFiles(
      files.map((f) => f.name),
      pages.map((p) => p.filename),
    );
    setImportReport(report);

    const byName = new Map(files.map((f) => [f.name, f]));
    const matched: [number, File][] = [];
    for (const [index, filename] of report.byIndex) {
      const file = byName.get(filename);
      if (file) matched.push([index, file]);
    }

    setIllustrations((cur) => {
      const next = { ...cur };
      for (const [index, file] of matched) {
        const prev = next[index];
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        next[index] = {
          status: "added",
          needsRegeneration: false,
          file,
          objectUrl: URL.createObjectURL(file),
          clientCheck: null,
          transform: undefined,
        };
      }
      return next;
    });

    const generation = importGeneration.current();
    for (const [index, file] of matched) {
      void runClientCheck(index, file, generation);
    }
  }

  function onRemove(index: number) {
    setEntry(index, emptyEntry());
  }

  function onApprove(index: number) {
    setIllustrations((cur) => {
      const entry = cur[index];
      if (!entry || entry.status === "missing") return cur;
      return { ...cur, [index]: { ...entry, status: "approved", needsRegeneration: false } };
    });
  }

  function onMarkNeedsRegeneration(index: number) {
    setIllustrations((cur) => {
      const entry = cur[index];
      if (!entry || entry.status === "missing") return cur;
      return { ...cur, [index]: { ...entry, status: "needs-regeneration", needsRegeneration: true } };
    });
  }

  function onClearNeedsRegeneration(index: number) {
    setIllustrations((cur) => {
      const entry = cur[index];
      if (!entry || entry.status === "missing") return cur;
      const nextStatus = entry.status === "needs-regeneration" ? "added" : entry.status;
      return { ...cur, [index]: { ...entry, status: nextStatus, needsRegeneration: false } };
    });
  }

  // ---------- Session actions (item 1-4, 7, 8) ----------

  /** "Clear all images" (item 2) — the one authoritative reset for every
   *  piece of image-related state. Story, child details, print profile, and
   *  prompts are untouched.
   *
   *  Order matters: bump the generation token FIRST (so any check already
   *  in flight is immediately disqualified from writing back, no matter how
   *  long it takes to resolve), THEN revoke every object URL still in the
   *  current state, THEN swap the illustrations map, THEN reset every
   *  other piece of image-scoped UI state, and finally reset the native
   *  file input so selecting the exact same files again re-fires onChange. */
  function clearAllImages() {
    importGeneration.bump();
    collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
    setIllustrations((cur) => clearedIllustrations(cur));
    setImportReport(null);
    setPrintifyResult(null);
    setError(null);
    setCorrectionIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** "Reset review" (item 3): images are kept; approved/needs-regeneration
   *  roll back to added. */
  function resetReview() {
    setIllustrations((cur) => reviewResetIllustrations(cur));
    setError(null);
  }

  /** Shared core of "Start new book" and "New child, same story" (item 4,
   *  8) — both fully reset everything this component owns; only the child
   *  detail fields differ in whether they're cleared. The currently
   *  selected story/print profile live in the parent (Studio) and are
   *  untouched either way. Never touches already-exported files — this is
   *  purely client/session state. */
  function resetManualSession(opts: { clearChildDetails: boolean }) {
    importGeneration.bump();
    collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
    setIllustrations({});
    setPages([]);
    setMarkdown("");
    setAnchorPrompt("");
    setImportReport(null);
    setPrintifyResult(null);
    setError(null);
    setCorrectionIndex(null);
    setStrictMode(false);
    setCopied(null);
    setStep("profile");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (opts.clearChildDetails) {
      setName("");
      setAge("4");
      setGender("boy");
    }
  }

  const importedCount = Object.values(illustrations).filter((e) => e.status !== "missing").length;

  function requestAction(action: Exclude<PendingAction, null>) {
    // "Reset review" only needs confirming when there's something to lose
    // (item 3: "confirmation only if needed").
    if (action === "reset-review" && !hasReviewDecisions(illustrations)) {
      resetReview();
      return;
    }
    setPendingAction(action);
  }

  function confirmPendingAction() {
    switch (pendingAction) {
      case "clear-images":
        clearAllImages();
        break;
      case "reset-review":
        resetReview();
        break;
      case "new-book":
        resetManualSession({ clearChildDetails: true });
        break;
      case "new-child":
        resetManualSession({ clearChildDetails: true });
        break;
    }
    setPendingAction(null);
  }

  // ---------- Export ----------

  /** Builds the export FormData, or null (with an error shown) if the
   *  approval/export gate (item 7, Phase 3) blocks it. This is a CLIENT-side
   *  gate layered in front of — never a replacement for — the server-side
   *  Phase 2 preflight, which still runs on every /api/assemble* call
   *  regardless. */
  function buildExportForm(): FormData | null {
    const gate = evaluateExportGate(
      pages.map((p) => illustrations[p.index]?.status ?? "missing"),
      { strict: strictMode },
    );
    if (gate.blocked) {
      setError(`Export blocked:\n${gate.reasons.join("\n")}`);
      return null;
    }
    const form = new FormData();
    form.append("name", name.trim());
    form.append("age", age);
    form.append("gender", gender);
    form.append("bookId", bookId);
    for (const p of pages) {
      const file = illustrations[p.index]?.file;
      // Explicit filename override: a Replace upload may have an arbitrary
      // original name, but it must still land on the right page server-side.
      if (file) form.append("images", file, p.filename);
    }
    const transformsObj: Record<number, ArtworkTransform> = {};
    for (const [key, entry] of Object.entries(illustrations)) {
      if (entry.transform) {
        transformsObj[Number(key)] = entry.transform;
      }
    }
    if (Object.keys(transformsObj).length > 0) {
      form.append("transforms", JSON.stringify(transformsObj));
    }
    return form;
  }

  const handleUpdateTransform = (manifestIndex: number, transform: ArtworkTransform) => {
    setIllustrations((cur) => {
      const entry = cur[manifestIndex];
      if (!entry) return cur;
      return {
        ...cur,
        [manifestIndex]: { ...entry, transform },
      };
    });
  };

  async function buildPdf() {
    setError(null);
    const form = buildExportForm();
    if (!form) return;
    form.append("profileId", profileId);
    setBusy(true);
    try {
      const res = await fetch("/api/assemble", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not build the PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.trim() || "storybook"}-${bookId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPrintify() {
    setError(null);
    setPrintifyResult(null);
    const form = buildExportForm();
    if (!form) return;
    form.append("profileId", profileId);
    setBusy(true);
    try {
      const res = await fetch("/api/assemble-printify", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const preflightErrors: string[] = data.preflight?.errors ?? [];
        setError(
          preflightErrors.length > 0
            ? `Preflight failed:\n${preflightErrors.join("\n")}`
            : (data.error ?? "Could not export for Printify."),
        );
        return;
      }
      setPrintifyResult({ dir: data.dir, files: data.files, warnings: data.warnings ?? [] });
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const reviewSequence = useMemo(() => buildReviewSequence(pages), [pages]);
  const pageLabelByIndex = useMemo(() => {
    const map = new Map<number, string>();
    const edition = getEditionForProfile(bookId, profile);
    if (edition) {
      for (const p of edition.physicalPages) {
        if (!map.has(p.illustrationIndex)) {
          if (p.side === "left" || p.side === "right") {
            const paired = edition.physicalPages.filter((x) => x.illustrationIndex === p.illustrationIndex);
            if (paired.length === 2) {
              map.set(p.illustrationIndex, `Pages ${paired[0].physicalPageNumber}–${paired[1].physicalPageNumber}`);
              continue;
            }
          }
          map.set(p.illustrationIndex, `Page ${p.physicalPageNumber}`);
        }
      }
    } else {
      for (const e of reviewSequence) {
        map.set(
          e.manifestIndex,
          e.layout === "spread" ? `Pages ${e.startPage}–${e.endPage}` : `Page ${e.page}`,
        );
      }
    }
    return map;
  }, [reviewSequence, bookId, profile]);

  const allPresent =
    pages.length > 0 &&
    pages.every((p) => (illustrations[p.index]?.status ?? "missing") !== "missing");
  const correctionPage =
    correctionIndex !== null ? (pages.find((p) => p.index === correctionIndex) ?? null) : null;

  const CONFIRM_COPY: Record<
    Exclude<PendingAction, null>,
    { title: string; message: string; confirmLabel: string; danger?: boolean }
  > = {
    "clear-images": {
      title: "Clear images?",
      message:
        `Clear all ${importedCount} imported image${importedCount === 1 ? "" : "s"}?\n` +
        `Your child details, story, and prompts will be kept.`,
      confirmLabel: "Clear images",
    },
    "reset-review": {
      title: "Reset review?",
      message:
        "Approved and needs-regeneration statuses will go back to Added. Your images are kept.",
      confirmLabel: "Reset review",
    },
    "new-book": {
      title: "Start a new book?",
      message:
        "This will clear the current child's details, all imported images, statuses, and " +
        "review progress.\n\nPreviously exported files on disk will NOT be deleted.",
      confirmLabel: "Start new book",
      danger: true,
    },
    "new-child": {
      title: "New child, same story?",
      message:
        "This clears the current child's details and all imported images. The selected " +
        "story and print profile stay the same.",
      confirmLabel: "New child",
      danger: true,
    },
  };

  return (
    <>
      {error && (
        <div className={styles.error}>
          {error.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {(step === "prompts" || step === "review") && (
        <div className={styles.sessionBar}>
          <button className={styles.sessionNewBook} onClick={() => requestAction("new-book")}>
            + New Book
          </button>
          <div className={styles.sessionSecondary}>
            <button className={styles.linkAction} onClick={() => requestAction("clear-images")}>
              Clear images
            </button>
            <button className={styles.linkAction} onClick={() => requestAction("reset-review")}>
              Reset review
            </button>
            <button className={styles.linkAction} onClick={() => requestAction("new-child")}>
              New child, same story
            </button>
          </div>
        </div>
      )}

      {step === "profile" && (
        <>
          <p className={styles.steps}>
            Step 1 of 3 — tell us about your child, then we&apos;ll give you the
            prompts to generate for free in the Gemini app.
          </p>
          <ProfileFields
            name={name}
            setName={setName}
            age={age}
            setAge={setAge}
            gender={gender}
            setGender={setGender}
          />
          <button className={styles.button} onClick={getPrompts} disabled={busy}>
            {busy ? "Building prompts…" : "Get my prompts →"}
          </button>
        </>
      )}

      {step === "prompts" && (
        <>
          <p className={styles.steps}>
            Step 2 of 3 — generate each image, import them, then review.
          </p>
          <div className={styles.instructions}>
            <strong>📸 Photos to use:</strong> 2–4 clear, front-facing, well-lit
            close-ups of just {name}&apos;s face — upright, no group shots, hats,
            or sunglasses. Sharper, simpler photos give a far better likeness.
          </div>

          <div className={styles.anchorCard}>
            <div className={styles.anchorHead}>
              <span className={styles.anchorStep}>Step 0</span>
              <strong>Make a character reference first — this is the secret</strong>
            </div>
            <p className={styles.anchorWhy}>
              In one Gemini chat, attach {name}&apos;s photos, run this prompt, and
              save the result as <code>00-character.png</code>. Then attach that
              portrait (plus a photo) to <em>every</em> page below so {name} stays
              the same on all {pages.length} pages.
            </p>
            <div className={styles.promptHead}>
              <span className={styles.promptFile}>→ save as 00-character.png</span>
              <button className={styles.copyButton} onClick={() => copyPrompt(anchorPrompt, 0)}>
                {copied === 0 ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className={styles.promptText}>{anchorPrompt}</p>
          </div>

          <p className={styles.steps}>
            Then generate each page — attach <code>00-character.png</code> + a
            photo, set the aspect ratio shown on the card, paste the prompt, and
            save with the filename.
          </p>

          <div className={styles.toolbar}>
            <button className={styles.secondaryButton} onClick={downloadMarkdown}>
              ⬇ Download prompts.md
            </button>
            <button className={styles.secondaryButton} onClick={() => setStep("profile")}>
              ← Edit details
            </button>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Your generated images{" "}
              <span className={styles.hint}>
                ({importedCount}/
                {pages.length} imported — bulk-select files named 01.png, 02.png, …)
              </span>
            </label>
            <label className={styles.dropzone}>
              <div style={{ fontSize: 30 }}>🖼️</div>
              <div className={styles.dropzoneText}>Click to choose images</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void onBulkImport(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {importReport && (
            <div className={styles.instructions}>
              <strong>Import report</strong>
              <div>Required: {importReport.required}</div>
              <div>Matched: {importReport.matched}</div>
              <div>Missing: {importReport.missing.length}</div>
              {importReport.missing.length > 0 && (
                <div className={styles.illoMeta}>{importReport.missing.join(", ")}</div>
              )}
              <div>Duplicates: {importReport.duplicates.length}</div>
              {importReport.duplicates.length > 0 && (
                <div className={styles.illoMeta}>
                  {importReport.duplicates
                    .map((d) => `"${d.filename}" (page already has "${d.claimedBy}")`)
                    .join("; ")}
                </div>
              )}
              <div>Unmatched: {importReport.unmatched.length}</div>
              {importReport.unmatched.length > 0 && (
                <div className={styles.illoMeta}>{importReport.unmatched.join(", ")}</div>
              )}
            </div>
          )}

          <div className={styles.illoList}>
            {pages.map((p) => (
              <IllustrationCard
                key={p.index}
                page={p}
                pageLabel={pageLabelByIndex.get(p.index) ?? `Page ${p.page}`}
                entry={illustrations[p.index] ?? emptyEntry()}
                copied={copied === p.page}
                onCopyPrompt={() => copyPrompt(p.prompt, p.page)}
                onReplace={(file) => void applyFile(p.index, file)}
                onRemove={() => onRemove(p.index)}
                onApprove={() => onApprove(p.index)}
                onMarkNeedsRegeneration={() => onMarkNeedsRegeneration(p.index)}
                onClearNeedsRegeneration={() => onClearNeedsRegeneration(p.index)}
                onOpenCorrection={() => setCorrectionIndex(p.index)}
              />
            ))}
          </div>

          <button
            className={styles.button}
            onClick={() => setStep("review")}
            disabled={!allPresent}
          >
            {allPresent ? "Review book →" : "Import every page to continue"}
          </button>
        </>
      )}

      {step === "review" && pages.length > 0 && (
        <BookReview
          manifest={pages}
          illustrations={illustrations}
          profile={profile}
          bookId={bookId}
          childName={name.trim() || "Alex"}
          strictMode={strictMode}
          onToggleStrict={setStrictMode}
          onBack={() => setStep("prompts")}
          busy={busy}
          exportLabel={exportMode === "printify-folder" ? "Export for Printify 📦" : "Build my PDF 📖"}
          onExport={exportMode === "printify-folder" ? exportPrintify : buildPdf}
          onUpdateTransform={handleUpdateTransform}
          onMarkNeedsRegeneration={onMarkNeedsRegeneration}
          onClearNeedsRegeneration={onClearNeedsRegeneration}
          onReplaceImage={(index, file) => void applyFile(index, file)}
          resultPanel={
            printifyResult && (
              <div className={styles.instructions}>
                <strong>✅ Exported {printifyResult.files.length} files to:</strong>
                <p className={styles.promptText}>{printifyResult.dir}</p>
                {printifyResult.warnings.length > 0 && (
                  <>
                    <strong>⚠️ Review before ordering:</strong>
                    <ul>
                      {printifyResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )
          }
        />
      )}

      {correctionPage && (
        <CorrectionPanel
          page={correctionPage}
          onClose={() => setCorrectionIndex(null)}
          onMarkNeedsRegeneration={() => onMarkNeedsRegeneration(correctionPage.index)}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          title={CONFIRM_COPY[pendingAction].title}
          message={CONFIRM_COPY[pendingAction].message}
          confirmLabel={CONFIRM_COPY[pendingAction].confirmLabel}
          danger={CONFIRM_COPY[pendingAction].danger}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}
    </>
  );
}

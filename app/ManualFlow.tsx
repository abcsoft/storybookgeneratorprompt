"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProfileFields, { type Gender } from "./ProfileFields";
import IllustrationCard from "./IllustrationCard";
import CorrectionPanel from "./CorrectionPanel";
import BookReview from "./BookReview";
import ConfirmDialog from "./ConfirmDialog";
import SpreadConfigurator from "./SpreadConfigurator";
import { matchImportedFiles, type ImportMatchReport, type LegacyInterpretation } from "@/lib/manual/importMatch";
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
import type { LayoutMode, CustomSpreadSelection, ResolvedAssetSlot } from "@/lib/story/layoutPlan";
import styles from "./page.module.css";

export type { IllustrationEntry };

export interface PreflightIssueDetail {
  type?: string;
  illustrationNumber?: number;
  filename?: string;
  expected?: string;
  actual?: string;
  recommendation?: string;
  message: string;
}

import type { PageLayout } from "@/lib/story/types";

export interface ManualPage {
  illustrationNumber?: number;
  illustrationIndex?: number;
  page: number;
  index: number;
  kind: string;
  role?: string;
  filename: string;
  canonicalFilename?: string;
  legacyAliases?: string[];
  prompt: string;
  text: string;
  aspect: string;
  spread?: boolean;
  pageLayout?: PageLayout;
  physicalPages?: number[];
  resolvedSlot?: ResolvedAssetSlot;
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

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`storybook_layout_mode_${bookId}`);
      if (saved === "custom-spreads" || saved === "standard-single") return saved;
    }
    return "standard-single";
  });

  const [customSpreads, setCustomSpreads] = useState<CustomSpreadSelection[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`storybook_custom_spreads_${bookId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    if (bookId === "dream-big") {
      return [{ startPage: 22, endPage: 23, textSide: "left", subjectSide: "right" }];
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`storybook_layout_mode_${bookId}`, layoutMode);
      localStorage.setItem(`storybook_custom_spreads_${bookId}`, JSON.stringify(customSpreads));
    }
  }, [bookId, layoutMode, customSpreads]);

  const [pages, setPages] = useState<ManualPage[]>([]);
  const [resolvedSlots, setResolvedSlots] = useState<ResolvedAssetSlot[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [anchorPrompt, setAnchorPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflightIssues, setPreflightIssues] = useState<PreflightIssueDetail[]>([]);
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);
  /** Quality warning slots requiring explicit user acknowledgement (150-299 PPI). */
  const [pendingQualityWarnings, setPendingQualityWarnings] = useState<any[] | null>(null);

  const clearServerErrors = useCallback(() => {
    setError(null);
    setPreflightIssues([]);
    setPreflightWarnings([]);
    setPendingQualityWarnings(null);
  }, []);

  useEffect(() => {
    clearServerErrors();
  }, [profileId, clearServerErrors]);

  useEffect(() => {
    clearServerErrors();
  }, [layoutMode, clearServerErrors]);

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
          mode: layoutMode,
          customSpreads,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not build prompts.");
        return false;
      }
      collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
      const nextPages = data.pages as ManualPage[];
      const nextResolvedSlots: ResolvedAssetSlot[] =
        data.resolvedSlots ??
        (nextPages.map((p) => p.resolvedSlot).filter(Boolean) as ResolvedAssetSlot[]);

      setPages(nextPages);
      setResolvedSlots(nextResolvedSlots);
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
        body: JSON.stringify({
          name: name.trim(),
          age,
          gender,
          bookId,
          profileId,
          mode: layoutMode,
          customSpreads,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not refresh prompts for the new print profile.");
        return;
      }
      const nextPages = data.pages as ManualPage[];
      const nextResolvedSlots: ResolvedAssetSlot[] =
        data.resolvedSlots ??
        (nextPages.map((p) => p.resolvedSlot).filter(Boolean) as ResolvedAssetSlot[]);
      const oldFilenames = new Set(pages.map((p) => p.filename));
      const newFilenames = new Set(nextPages.map((p) => p.filename));
      const layoutChanged =
        oldFilenames.size !== newFilenames.size ||
        [...oldFilenames].some((f) => !newFilenames.has(f));

      setPages(nextPages);
      setResolvedSlots(nextResolvedSlots);
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
    clearServerErrors();
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

  const [pendingLegacyFiles, setPendingLegacyFiles] = useState<File[] | null>(null);

  const currentResolvedSlots = useMemo<ResolvedAssetSlot[]>(() => {
    if (resolvedSlots.length > 0) return resolvedSlots;
    return pages.map((p) => p.resolvedSlot).filter(Boolean) as ResolvedAssetSlot[];
  }, [resolvedSlots, pages]);

  /**
   * Applies the user's explicit legacy interpretation choice for ambiguous packages.
   */
  function onSelectLegacyInterpretation(interpretation: LegacyInterpretation, files: File[]) {
    const report = matchImportedFiles(
      files.map((f) => f.name),
      currentResolvedSlots,
      { legacyInterpretation: interpretation, bookId },
    );
    setImportReport(report);
    setPendingLegacyFiles(null);

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

  /**
   * @deprecated Use onSelectLegacyInterpretation with an explicit LegacyInterpretation instead.
   */
  function onConfirmLegacyRecovery(files: File[]) {
    console.warn("onConfirmLegacyRecovery is deprecated. Use onSelectLegacyInterpretation instead.");
    onSelectLegacyInterpretation("SHIFT_PLUS_TWO", files);
  }

  /** Bulk import: match files against authoritative slots with guarded recovery. */
  function onBulkImport(list: FileList | null) {
    if (!list) return;
    clearServerErrors();
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const report = matchImportedFiles(
      files.map((f) => f.name),
      currentResolvedSlots,
      { confirmLegacyOffsetRecovery: false, bookId },
    );
    setImportReport(report);

    if (report.legacyRecoveryProposal) {
      setPendingLegacyFiles(files);
      return;
    }

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
    clearServerErrors();
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

  function handleUpdateTransform(index: number, transform: ArtworkTransform) {
    clearServerErrors();
    setIllustrations((cur) => {
      const entry = cur[index];
      if (!entry || entry.status === "missing") return cur;
      // If framing is changed after approval, reset approval to "added" for safety so user re-reviews
      const nextStatus = entry.status === "approved" ? "added" : entry.status;
      return {
        ...cur,
        [index]: {
          ...entry,
          transform,
          status: nextStatus,
        },
      };
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
    clearServerErrors();
    setCorrectionIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** "Reset review" (item 3): images are kept; approved/needs-regeneration
   *  roll back to added. */
  function resetReview() {
    setIllustrations((cur) => reviewResetIllustrations(cur));
    clearServerErrors();
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
    clearServerErrors();
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
    form.append("profileId", profileId);
    form.append("layoutMode", layoutMode);
    form.append("mode", layoutMode);
    form.append("customSpreads", JSON.stringify(customSpreads));
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

  async function buildPdf(overrideAcknowledgeQualityWarnings?: boolean) {
    clearServerErrors();
    const form = buildExportForm();
    if (!form) return;
    // Pass quality warning acknowledgement if user explicitly approved
    if (overrideAcknowledgeQualityWarnings === true) {
      form.append("acknowledgeQualityWarnings", "true");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/assemble", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        // HTTP 409: Quality warning acknowledgement required
        if (res.status === 409 && data.code === "QUALITY_WARNING_ACKNOWLEDGEMENT_REQUIRED") {
          setPendingQualityWarnings(data.qualityWarnings ?? []);
          return;
        }

        // HTTP 409: Legacy mapping confirmation required (should not normally
        // happen from buildPdf since files are named canonically by the UI,
        // but handle gracefully)
        if (res.status === 409 && data.code === "LEGACY_MAPPING_CONFIRMATION_REQUIRED") {
          setError(data.message ?? "Ambiguous file package — please re-import with canonical filenames.");
          return;
        }

        const rawErrors: string[] = data.preflight?.errors ?? [];
        const rawWarnings: string[] = data.preflight?.warnings ?? [];
        const rawIssues: any[] = data.issues ?? data.preflight?.issues ?? [];

        setPreflightWarnings(rawWarnings);

        const structured: PreflightIssueDetail[] = [];
        if (Array.isArray(rawIssues) && rawIssues.length > 0) {
          for (const item of rawIssues) {
            structured.push({
              type: item.type,
              illustrationNumber: item.illustrationNumber,
              filename: item.filename,
              expected: item.expected,
              actual: item.actual,
              recommendation: item.recommendation,
              message: item.message ?? (typeof item === "string" ? item : ""),
            });
          }
        } else if (rawErrors.length > 0) {
          for (const err of rawErrors) {
            const fileMatch = err.match(/"([^"]+\.(?:png|jpg|jpeg|webp))"/i);
            const illoMatch = err.match(/Illustration\s+(\d+)/i);
            structured.push({
              illustrationNumber: illoMatch ? parseInt(illoMatch[1], 10) : undefined,
              filename: fileMatch ? fileMatch[1] : undefined,
              message: err,
            });
          }
        }

        if (structured.length > 0) {
          setPreflightIssues(structured);
          setError(null);
        } else {
          setPreflightIssues([]);
          setError(data.error ?? "Preflight validation failed — production export blocked.");
        }
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
    clearServerErrors();
    setPrintifyResult(null);
    const form = buildExportForm();
    if (!form) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assemble-printify", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawErrors: string[] = data.preflight?.errors ?? [];
        const rawWarnings: string[] = data.preflight?.warnings ?? data.warnings ?? [];
        const rawIssues: any[] = data.issues ?? data.preflight?.issues ?? [];
        setPreflightWarnings(rawWarnings);

        const structured: PreflightIssueDetail[] = [];
        if (Array.isArray(rawIssues) && rawIssues.length > 0) {
          for (const item of rawIssues) {
            structured.push({
              type: item.type,
              illustrationNumber: item.illustrationNumber,
              filename: item.filename,
              expected: item.expected,
              actual: item.actual,
              recommendation: item.recommendation,
              message: item.message ?? (typeof item === "string" ? item : ""),
            });
          }
        } else if (rawErrors.length > 0) {
          for (const err of rawErrors) {
            const fileMatch = err.match(/"([^"]+\.(?:png|jpg|jpeg|webp))"/i);
            const illoMatch = err.match(/Illustration\s+(\d+)/i);
            structured.push({
              illustrationNumber: illoMatch ? parseInt(illoMatch[1], 10) : undefined,
              filename: fileMatch ? fileMatch[1] : undefined,
              message: err,
            });
          }
        }

        if (structured.length > 0) {
          setPreflightIssues(structured);
          setError(null);
        } else {
          setPreflightIssues([]);
          setError(data.error ?? "Could not export for Printify.");
        }
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
      {importReport?.legacyRecoveryProposal && (
        <div
          className={styles.preflightBlockedPanel}
          style={{
            border: "2px solid #f59e0b",
            background: "rgba(245, 158, 11, 0.08)",
            marginBottom: "20px",
            padding: "20px",
            borderRadius: "12px",
          }}
          data-testid="legacy-recovery-choice-panel"
        >
          <div className={styles.preflightBlockedHeader} style={{ color: "#d97706", fontSize: "17px", fontWeight: 700 }}>
            <span>⚠️</span>
            <span>Ambiguous 22-File Package Detected — Choose Interpretation</span>
          </div>
          <p style={{ margin: "10px 0 16px", fontSize: "14px", color: "var(--ink)" }}>
            {importReport.legacyRecoveryProposal}
          </p>

          {importReport.legacyRecoveryChoices && importReport.legacyRecoveryChoices.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "20px" }}>
              {importReport.legacyRecoveryChoices.map((choice) => (
                <div
                  key={choice.interpretation}
                  data-testid={`legacy-choice-${choice.interpretation.toLowerCase().replace(/_/g, "-")}`}
                  style={{
                    background: "var(--card-bg, #ffffff)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    borderRadius: "8px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#b45309", marginBottom: "6px" }}>
                    {choice.label}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted, #64748b)", marginBottom: "12px" }}>
                    {choice.description}
                  </div>

                  <div
                    style={{
                      marginBottom: "12px",
                      fontSize: "13px",
                      background: "rgba(239, 68, 68, 0.08)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    <strong style={{ color: "#dc2626" }}>Resulting missing slots: </strong>
                    <span style={{ color: "#991b1b" }}>
                      {choice.resultingMissingSlots.map((s) => `${s.slotId} (Page ${s.physicalPages.join(", ")})`).join(", ")}
                    </span>
                  </div>

                  <div
                    style={{
                      maxHeight: "220px",
                      overflowY: "auto",
                      border: "1px solid var(--border, #e2e8f0)",
                      borderRadius: "6px",
                      marginBottom: "16px",
                    }}
                  >
                    <table
                      data-testid={`table-legacy-${choice.interpretation.toLowerCase().replace(/_/g, "-")}`}
                      style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", textAlign: "left" }}
                    >
                      <thead style={{ position: "sticky", top: 0, background: "#f8fafc", borderBottom: "1px solid #cbd5e1" }}>
                        <tr>
                          <th style={{ padding: "6px 8px", color: "#475569" }}>File</th>
                          <th style={{ padding: "6px 8px", color: "#475569" }}>Slot</th>
                          <th style={{ padding: "6px 8px", color: "#475569" }}>Role</th>
                          <th style={{ padding: "6px 8px", color: "#475569" }}>Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choice.mappingTable.map((row) => (
                          <tr key={row.filename} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.filename}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.proposedSlotId}</td>
                            <td style={{ padding: "6px 8px" }}>{row.role}</td>
                            <td style={{ padding: "6px 8px" }}>{row.physicalPages.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: "auto" }}>
                    {choice.interpretation === "SHIFT_PLUS_TWO" ? (
                      <button
                        type="button"
                        data-testid="btn-legacy-shift-plus-two"
                        className={styles.button}
                        style={{ width: "100%", background: "#f59e0b", color: "#1c1440", fontWeight: 700 }}
                        onClick={() => {
                          if (pendingLegacyFiles) {
                            onSelectLegacyInterpretation("SHIFT_PLUS_TWO", pendingLegacyFiles);
                          }
                        }}
                      >
                        These files are Pilot through Back Cover
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="btn-legacy-keep-numeric"
                        className={styles.button}
                        style={{ width: "100%", background: "#d97706", color: "#ffffff", fontWeight: 700 }}
                        onClick={() => {
                          if (pendingLegacyFiles) {
                            onSelectLegacyInterpretation("KEEP_NUMERIC_SLOTS", pendingLegacyFiles);
                          }
                        }}
                      >
                        These files are Cover through Inventor
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
              <button
                type="button"
                data-testid="btn-legacy-shift-plus-two"
                className={styles.button}
                style={{ background: "#f59e0b", color: "#1c1440", fontWeight: 700 }}
                onClick={() => {
                  if (pendingLegacyFiles) {
                    onSelectLegacyInterpretation("SHIFT_PLUS_TWO", pendingLegacyFiles);
                  }
                }}
              >
                These files are Pilot through Back Cover
              </button>
              <button
                type="button"
                data-testid="btn-legacy-keep-numeric"
                className={styles.button}
                style={{ background: "#d97706", color: "#ffffff", fontWeight: 700 }}
                onClick={() => {
                  if (pendingLegacyFiles) {
                    onSelectLegacyInterpretation("KEEP_NUMERIC_SLOTS", pendingLegacyFiles);
                  }
                }}
              >
                These files are Cover through Inventor
              </button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              data-testid="btn-legacy-cancel"
              className={styles.buttonSecondary}
              onClick={() => {
                setImportReport(null);
                setPendingLegacyFiles(null);
              }}
            >
              Cancel and rename files
            </button>
          </div>
        </div>
      )}

      {preflightIssues.length > 0 && (
        <div className={styles.preflightBlockedPanel} data-testid="preflight-blocked-panel">
          <div className={styles.preflightBlockedHeader}>
            <span>⛔</span>
            <span>Why export is blocked ({preflightIssues.length} {preflightIssues.length === 1 ? "issue" : "issues"})</span>
          </div>
          <div className={styles.preflightIssueList}>
            {preflightIssues.map((issue, idx) => (
              <div key={idx} className={styles.preflightIssueCard} data-testid="preflight-issue-card">
                <div className={styles.preflightIssueTitle}>
                  <span className={styles.preflightBadge}>
                    {issue.type ? issue.type.toUpperCase() : "ERROR"}
                  </span>
                  <span>
                    {issue.illustrationNumber !== undefined ? `Illustration ${issue.illustrationNumber}` : "General"}
                    {issue.filename ? ` — ${issue.filename}` : ""}
                  </span>
                </div>
                {(issue.expected || issue.actual) && (
                  <div className={styles.preflightDetailGrid}>
                    {issue.expected && (
                      <>
                        <div className={styles.preflightLabel}>Expected:</div>
                        <div className={styles.preflightValue}>{issue.expected}</div>
                      </>
                    )}
                    {issue.actual && (
                      <>
                        <div className={styles.preflightLabel}>Actual:</div>
                        <div className={styles.preflightValue}>{issue.actual}</div>
                      </>
                    )}
                  </div>
                )}
                {issue.message && (!issue.expected || !issue.actual) && (
                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#374151" }}>
                    {issue.message}
                  </div>
                )}
                {issue.recommendation && (
                  <div className={styles.preflightAction}>
                    💡 <strong>Recommended action:</strong> {issue.recommendation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && preflightIssues.length === 0 && (
        <div className={styles.error} data-testid="preflight-generic-error">
          {error.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {preflightWarnings.length > 0 && (
        <div className={styles.preflightWarningsPanel} data-testid="preflight-warnings-panel">
          <div className={styles.preflightWarningsHeader}>
            <span>⚠️</span>
            <strong>Non-blocking warnings ({preflightWarnings.length})</strong>
          </div>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {preflightWarnings.map((w, idx) => (
              <li key={idx} style={{ marginTop: "4px" }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Quality Warning Acknowledgement Dialog */}
      {pendingQualityWarnings && pendingQualityWarnings.length > 0 && (
        <div
          className={styles.preflightWarningsPanel}
          data-testid="quality-warning-dialog"
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: "640px",
            width: "90%",
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            borderColor: "#f59e0b",
            background: "#fffbeb",
          }}
        >
          <div className={styles.preflightWarningsHeader}>
            <span>⚠️</span>
            <strong>Quality Warning — Acknowledgement Required</strong>
          </div>
          <p style={{ margin: "8px 0", fontSize: "13px", color: "#92400e" }}>
            The following images are between 150–299 native PPI. Production print quality
            may be reduced. You must explicitly acknowledge this to continue.
          </p>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {pendingQualityWarnings.map((w: any, idx: number) => (
              <li key={idx} style={{ marginTop: "4px", fontSize: "13px" }}>
                <strong>{w.filename}</strong> — {w.nativeWidth}×{w.nativeHeight} px
                ({Math.round(w.nativeEffectivePpi)} PPI) → Physical page{w.physicalPages?.length > 1 ? "s" : ""} {w.physicalPages?.join(", ")}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
            <button
              className={styles.sessionNewBook}
              style={{ background: "#f59e0b", borderColor: "#d97706" }}
              onClick={() => {
                setPendingQualityWarnings(null);
                void buildPdf(true);
              }}
              data-testid="acknowledge-quality-warnings"
            >
              I understand — proceed with export
            </button>
            <button
              className={styles.linkAction}
              onClick={() => setPendingQualityWarnings(null)}
              data-testid="cancel-quality-warnings"
            >
              Cancel
            </button>
          </div>
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
            Step 1 of 3 — tell us about your child and choose your book layout,
            then we&apos;ll give you the prompts to generate for free in the Gemini app.
          </p>
          <ProfileFields
            name={name}
            setName={setName}
            age={age}
            setAge={setAge}
            gender={gender}
            setGender={setGender}
          />
          <SpreadConfigurator
            bookId={bookId}
            profileId={profileId}
            mode={layoutMode}
            onModeChange={setLayoutMode}
            customSpreads={customSpreads}
            onCustomSpreadsChange={setCustomSpreads}
            childName={name.trim() || "Child"}
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
                onOpenFramingEditor={() => {
                  setStep("review");
                  // BookReview component handles framingEditorIndex
                }}
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
          layoutMode={layoutMode}
          customSpreads={customSpreads}
          strictMode={strictMode}
          onToggleStrict={setStrictMode}
          onBack={() => setStep("prompts")}
          busy={busy}
          exportLabel={exportMode === "printify-folder" ? "Export for Printify 📦" : "Build my PDF 📖"}
          onExport={exportMode === "printify-folder" ? exportPrintify : () => void buildPdf()}
          onUpdateTransform={handleUpdateTransform}
          onApprovePage={onApprove}
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

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
import { fetchJson, formatApiError } from "@/lib/http/apiResponse";
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
import {
  computeAuthoritativePhysicalDimensionsIn,
  computeEffectivePpi,
  type ImageProvenanceMetadata,
} from "@/lib/enhance/provenance";
import type { SignedEnhancementReceipt, SignedEnhancementApprovalRecord } from "@/lib/enhance/types";
import type { SemanticValidationResult } from "@/lib/semantic/types";
import type { QualityAcknowledgementRecord } from "@/lib/print/preflight";
import {
  calculateLegacyDreamBigRemap,
  type LegacyRemapMappingEntry,
  DREAM_BIG_CANONICAL_SLOTS,
} from "@/lib/story/legacyRemap";
import styles from "./page.module.css";

export type { IllustrationEntry };

export interface PreflightIssueDetail {
  type?: string;
  illustrationNumber?: number;
  filename?: string;
  slotId?: string;
  expected?: string;
  actual?: string;
  recommendation?: string;
  message: string;
}

import type { PageLayout } from "@/lib/story/types";

export interface ManualPage {
  slotId?: string;
  illustrationNumber?: number;
  illustrationIndex?: number;
  page: number;
  index: number;
  kind: string;
  role?: string;
  roleSlug?: string;
  filename: string;
  canonicalFilename?: string;
  expectedFilename?: string;
  legacyAliases?: string[];
  prompt: string;
  text: string;
  aspect: string;
  targetCanvasAspect?: string;
  spread?: boolean;
  pageLayout?: PageLayout;
  physicalPages?: number[];
  resolvedSlot?: ResolvedAssetSlot;
}

/** POST /api/prompts success-body shape, as returned by app/api/prompts/route.ts. */
interface PromptsApiResponse {
  pages: ManualPage[];
  markdown: string;
  anchorPrompt: string;
  resolvedSlots?: any[];
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
  const [qualityAcknowledgements, setQualityAcknowledgements] = useState<Record<string, QualityAcknowledgementRecord>>({});
  const [enhancerAvailable, setEnhancerAvailable] = useState<boolean | null>(null);
  const [activeProvider, setActiveProvider] = useState<{
    id: string;
    name: string;
    providerClass: string;
    available: boolean;
    isPaid: boolean;
    estimatedCostUsd?: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/enhance")
      .then((r) => r.json())
      .then((data) => {
        if (data.isAvailable === true && data.provider) {
          setEnhancerAvailable(true);
          setActiveProvider(data.provider);
        } else {
          setEnhancerAvailable(false);
          setActiveProvider(null);
        }
      })
      .catch(() => {
        setEnhancerAvailable(false);
        setActiveProvider(null);
      });
  }, []);

  const clearServerErrors = useCallback(() => {
    setError(null);
    setPreflightIssues([]);
    setPreflightWarnings([]);
    setPendingQualityWarnings(null);
  }, []);

  useEffect(() => {
    clearServerErrors();
    setQualityAcknowledgements({});
  }, [profileId, clearServerErrors]);

  useEffect(() => {
    clearServerErrors();
    setQualityAcknowledgements({});
  }, [layoutMode, clearServerErrors]);

  const [copied, setCopied] = useState<number | null>(null);
  const [printifyResult, setPrintifyResult] = useState<PrintifyExportSummary | null>(null);

  const [illustrations, setIllustrations] = useState<Record<number, IllustrationEntry>>({});
  const [importReport, setImportReport] = useState<ImportMatchReport | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // Resolution enhancement and semantic validation states
  const [enhancingIndices, setEnhancingIndices] = useState<Set<number>>(new Set());
  const [checkingSemanticIndices, setCheckingSemanticIndices] = useState<Set<number>>(new Set());
  const [batchEnhancing, setBatchEnhancing] = useState(false);
  const [batchEnhanceProgress, setBatchEnhanceProgress] = useState<{
    total: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } | null>(null);
  const [failedEnhanceIndices, setFailedEnhanceIndices] = useState<number[]>([]);
  const batchEnhanceCancelRef = useRef(false);
  const [batchChecking, setBatchChecking] = useState(false);

  // Legacy Dream Big Content Remap states
  const [legacyRemapOpen, setLegacyRemapOpen] = useState(false);
  const [savedPreRemapIllustrations, setSavedPreRemapIllustrations] = useState<Record<number, IllustrationEntry> | null>(null);
  const [isLegacyRemapped, setIsLegacyRemapped] = useState(false);

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
      const result = await fetchJson<PromptsApiResponse>(
        "/api/prompts",
        {
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
        },
        {
          serverErrorCode: "PROMPTS_SERVER_ERROR",
          serverErrorMessage: "The server hit an unexpected error while building your prompts.",
        },
      );
      if (!result.ok) {
        setError(formatApiError(result));
        return false;
      }
      const data = result.data;
      collectObjectUrls(illustrations).forEach((u) => URL.revokeObjectURL(u));
      const nextPages = data.pages as ManualPage[];
      const rawSlots: any[] =
        data.resolvedSlots ??
        (nextPages.map((p) => p.resolvedSlot).filter(Boolean) as ResolvedAssetSlot[]);
      const nextResolvedSlots: ResolvedAssetSlot[] = rawSlots.map((s) => ({
        ...s,
        filename: s.filename ?? s.expectedFilename,
        expectedFilename: s.expectedFilename ?? s.filename,
      }));

      setPages(nextPages);
      setResolvedSlots(nextResolvedSlots);
      setMarkdown(data.markdown);
      setAnchorPrompt(data.anchorPrompt ?? "");
      setIllustrations(freshIllustrations(nextPages.map((p) => p.index)));
      setImportReport(null);
      setPrintifyResult(null);
      return true;
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
      const result = await fetchJson<PromptsApiResponse>(
        "/api/prompts",
        {
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
        },
        {
          serverErrorCode: "PROMPTS_SERVER_ERROR",
          serverErrorMessage:
            "The server hit an unexpected error while refreshing prompts for the new print profile.",
        },
      );
      if (!result.ok) {
        setError(formatApiError(result));
        return;
      }
      const data = result.data;
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
          const expectedAspect = p.resolvedSlot?.destinationDimensions
            ? `${p.resolvedSlot.destinationDimensions.width}:${p.resolvedSlot.destinationDimensions.height}`
            : (p.targetCanvasAspect ?? p.aspect);
          void checkImportedImage(currentFile, expectedAspect).then((check) => {
            if (importGeneration.isStale(generation)) return; // reset meanwhile
            setIllustrations((cur) => {
              const current = cur[p.index];
              if (!current || current.file !== currentFile) return cur;
              return { ...cur, [p.index]: { ...current, clientCheck: check } };
            });
          });
        }
      }
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
    const expectedAspect = page.resolvedSlot?.destinationDimensions
      ? `${page.resolvedSlot.destinationDimensions.width}:${page.resolvedSlot.destinationDimensions.height}`
      : (page.targetCanvasAspect ?? page.aspect);
    const check = await checkImportedImage(file, expectedAspect);
    if (importGeneration.isStale(generation)) return; // a reset happened meanwhile

    let width = check.width ?? 0;
    let height = check.height ?? 0;
    let nativeEffectivePpi = 300;
    let sha256 = "";

    if (width > 0 && height > 0) {
      const destDims = page.resolvedSlot?.destinationDimensions ?? profile.canvasPx;
      const physicalDimensions = computeAuthoritativePhysicalDimensionsIn(destDims, profile.dpi);
      nativeEffectivePpi = computeEffectivePpi({ width, height }, physicalDimensions);
    }

    try {
      const arrayBuf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", arrayBuf);
      sha256 = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      /* fallback if subtle crypto is unavailable */
    }

    setIllustrations((cur) => {
      const current = cur[index];
      if (!current || current.file !== file) return cur; // superseded already
      const initialProvenance: ImageProvenanceMetadata = current.provenance ?? {
        originalPixelDimensions: { width: width || 1200, height: height || 880 },
        nativeEffectivePpi: Number(nativeEffectivePpi.toFixed(1)),
        outputGridPpi: 300,
        upscaleFactor: 1.0,
        enhancementMethod: "none",
        enhancementStatus: "none",
        originalSha256: sha256,
        approvalRequired: false,
        approvedAt: null,
        originalFilename: file.name,
      };

      return {
        ...cur,
        [index]: {
          ...current,
          clientCheck: check,
          originalFile: current.originalFile ?? file,
          originalObjectUrl: current.originalObjectUrl ?? current.objectUrl,
          provenance: initialProvenance,
        },
      };
    });
  }

  const invalidateSlotAcknowledgement = useCallback((slotIdOrIndex: string | number) => {
    setQualityAcknowledgements((prev) => {
      const next = { ...prev };
      if (typeof slotIdOrIndex === "number") {
        const page = pages.find((p) => p.index === slotIdOrIndex);
        const slotId = page?.resolvedSlot?.slotId ?? page?.filename;
        if (slotId && next[slotId]) delete next[slotId];
      } else {
        if (next[slotIdOrIndex]) delete next[slotIdOrIndex];
      }
      return next;
    });
  }, [pages]);

  /** Assign or replace a file for a page — invalidates old transform metadata
   *  and clears regeneration flags, landing as "added". */
  function applyFile(index: number, file: File) {
    clearServerErrors();
    invalidateSlotAcknowledgement(index);
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
    const base = resolvedSlots.length > 0
      ? resolvedSlots
      : (pages.map((p) => p.resolvedSlot).filter(Boolean) as ResolvedAssetSlot[]);
    return base.map((s) => ({
      ...s,
      filename: s.filename ?? s.expectedFilename,
      expectedFilename: s.expectedFilename ?? s.filename,
    }));
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
    invalidateSlotAcknowledgement(index);
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
    invalidateSlotAcknowledgement(index);
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

  // ---------- Resolution Enhancement & Semantic Validation Handlers ----------

  async function handleAutoFixResolution(
    index: number,
    skipConfirm = false,
    confirmedPaid = false,
    selectedProviderId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const page = pages.find((p) => p.index === index);
    const entry = illustrations[index];
    if (!page || !entry?.file) return { success: false, error: "No illustration image found." };

    try {
      let provId = selectedProviderId;
      let userConfirmedPaid = confirmedPaid;

      // Check provider availability & costs if not supplied
      if (!provId) {
        const provRes = await fetch("/api/enhance");
        const provData = await provRes.json().catch(() => ({}));
        const isAvail = provRes.ok && provData.isAvailable && (provData.provider?.isConfigured || provData.provider?.available);
        if (!isAvail) {
          const msg = provData.error ?? "Resolution enhancement provider is currently unavailable in production.";
          setEnhancerAvailable(false);
          setActiveProvider(null);
          return { success: false, error: msg };
        }
        provId = provData.provider.id;

        if (provData.provider?.isPaid && !userConfirmedPaid) {
          if (!skipConfirm) {
            const cost = provData.provider.estimatedCostUsd ?? provData.costEstimate?.estimatedCostUsd ?? 0.04;
            const proceed = window.confirm(
              `Resolution enhancement uses paid provider "${provData.provider.name}".\n` +
              `Estimated cost: $${cost} USD per image.\n\n` +
              `Proceed with enhancement?`
            );
            if (!proceed) return { success: false, error: "User cancelled confirmation." };
            userConfirmedPaid = true;
          }
        }
      }

      setEnhancingIndices((cur) => new Set(cur).add(index));

      const fileToEnhance = entry.originalFile ?? entry.file;
      const form = new FormData();
      form.append("file", fileToEnhance);
      form.append("slotId", page.resolvedSlot?.slotId ?? `slot-${page.page}`);
      form.append("bookId", bookId);
      form.append("profileId", profileId);
      form.append("layoutMode", layoutMode);
      if (provId) form.append("providerId", provId);
      if (userConfirmedPaid) form.append("userConfirmedPaid", "true");

      const res = await fetch("/api/enhance", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? "Resolution enhancement failed.";
        if (!skipConfirm) alert(errMsg);
        return { success: false, error: errMsg };
      }

      const rawB64 = data.enhancedBase64.includes(",")
        ? data.enhancedBase64.split(",")[1]
        : data.enhancedBase64;
      const byteCharacters = atob(rawB64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType || "image/png" });
      const enhancedFile = new File([blob], fileToEnhance.name, { type: data.mimeType || "image/png" });
      const enhancedUrl = URL.createObjectURL(enhancedFile);

      setIllustrations((cur) => {
        const prev = cur[index];
        if (!prev) return cur;
        const needsApproval = data.provenance?.approvalRequired ?? false;
        return {
          ...cur,
          [index]: {
            ...prev,
            file: enhancedFile,
            objectUrl: enhancedUrl,
            originalFile: prev.originalFile ?? prev.file,
            originalObjectUrl: prev.originalObjectUrl ?? prev.objectUrl,
            provenance: data.provenance,
            receipt: data.receipt ?? null,
            status: needsApproval ? "added" : "approved",
          },
        };
      });

      return { success: true };
    } catch (err: any) {
      const errMsg = `Enhancement error: ${err.message ?? String(err)}`;
      if (!skipConfirm) alert(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setEnhancingIndices((cur) => {
        const next = new Set(cur);
        next.delete(index);
        return next;
      });
    }
  }

  async function handleApproveEnhancement(index: number) {
    const prev = illustrations[index];
    if (!prev || !prev.provenance) return;
    const page = pages.find((p) => p.index === index);
    const slotId = page?.resolvedSlot?.slotId ?? page?.filename ?? "";
    const enhancedSha256 = prev.provenance.enhancedSha256;
    const destDims = page?.resolvedSlot?.destinationDimensions ?? { width: 3375, height: 2475 };

    let signedApprovalRecord: SignedEnhancementApprovalRecord | undefined = undefined;
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_visual_review",
          bookId: bookId || "dream-big",
          slotId,
          profileId: profile.id,
          layoutMode: layoutMode || "standard-single",
          enhancedSha256,
          destinationDimensions: destDims,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.signedApprovalRecord) {
        signedApprovalRecord = data.signedApprovalRecord;
      }
    } catch (err) {
      console.error("Failed to sign visual approval record:", err);
    }

    setIllustrations((cur) => {
      const current = cur[index];
      if (!current || !current.provenance) return cur;
      return {
        ...cur,
        [index]: {
          ...current,
          status: "approved",
          provenance: {
            ...current.provenance,
            enhancementStatus: "approved",
            approvedAt: signedApprovalRecord?.payload.approvedAt ?? new Date().toISOString(),
            approvalRecord: signedApprovalRecord,
          },
        },
      };
    });
    setTimeout(() => {
      void runPreflightCheck();
    }, 50);
  }

  const pendingApprovalCount = useMemo(() => {
    return pages.filter((p) => {
      const entry = illustrations[p.index];
      return entry?.provenance?.approvalRequired && !entry.provenance.approvalRecord;
    }).length;
  }, [pages, illustrations]);

  async function handleApproveAllEnhancements() {
    for (const p of pages) {
      const entry = illustrations[p.index];
      if (entry?.provenance?.approvalRequired && !entry.provenance.approvalRecord) {
        await handleApproveEnhancement(p.index);
      }
    }
    setTimeout(() => {
      void runPreflightCheck();
    }, 100);
  }

  function handleRevertEnhancement(index: number) {
    setIllustrations((cur) => {
      const prev = cur[index];
      if (!prev || !prev.originalFile || !prev.originalObjectUrl) return cur;
      if (prev.objectUrl && prev.objectUrl !== prev.originalObjectUrl) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      return {
        ...cur,
        [index]: {
          ...prev,
          file: prev.originalFile,
          objectUrl: prev.originalObjectUrl,
          receipt: null,
          provenance: prev.provenance
            ? {
                ...prev.provenance,
                enhancedPixelDimensions: undefined,
                enhancedEffectivePpi: undefined,
                enhancedSha256: undefined,
                enhancementMethod: "none",
                enhancementStatus: "none",
                approvalRequired: false,
                approvedAt: null,
              }
            : undefined,
          status: "added",
        },
      };
    });
  }

  async function handleCheckStoryMatch(index: number) {
    const page = pages.find((p) => p.index === index);
    const entry = illustrations[index];
    if (!page || !entry?.file) return;

    setCheckingSemanticIndices((cur) => new Set(cur).add(index));
    try {
      const form = new FormData();
      form.append("file", entry.originalFile ?? entry.file);
      form.append("slotId", page.resolvedSlot?.slotId ?? `slot-${page.page}`);
      form.append("roleSlug", page.roleSlug ?? page.role ?? "");
      form.append("expectedRole", page.role ?? page.roleSlug ?? page.kind);
      form.append("storyText", page.text ?? "");
      form.append("prompt", page.prompt ?? "");
      form.append(
        "otherSlots",
        JSON.stringify(
          pages.map((p) => ({
            slotId: p.resolvedSlot?.slotId ?? `slot-${p.page}`,
            roleSlug: p.roleSlug ?? p.role ?? "",
            role: p.role ?? "",
          })),
        ),
      );

      const res = await fetch("/api/semantic-check", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setIllustrations((cur) => {
          const prev = cur[index];
          if (!prev) return cur;
          return {
            ...cur,
            [index]: {
              ...prev,
              semanticValidation: data,
            },
          };
        });
      } else {
        // Network/provider failures must persist and display CHECK_FAILED; do not swallow them!
        setIllustrations((cur) => {
          const prev = cur[index];
          if (!prev) return cur;
          return {
            ...cur,
            [index]: {
              ...prev,
              semanticValidation: {
                status: "CHECK_FAILED",
                slotId: page.resolvedSlot?.slotId ?? `slot-${page.page}`,
                filename: prev.file?.name ?? `page-${index}.png`,
                expectedRole: page.role ?? page.roleSlug ?? page.kind,
                detectedContent: "Unable to inspect image",
                confidence: 0,
                explanation: data.error ?? "HTTP " + res.status,
                analysisMethod: "none",
                checkedAt: new Date().toISOString(),
              },
            },
          };
        });
      }
    } catch (err: any) {
      setIllustrations((cur) => {
        const prev = cur[index];
        if (!prev) return cur;
        return {
          ...cur,
          [index]: {
            ...prev,
            semanticValidation: {
              status: "CHECK_FAILED",
              slotId: page.resolvedSlot?.slotId ?? `slot-${page.page}`,
              filename: prev.file?.name ?? `page-${index}.png`,
              expectedRole: page.role ?? page.roleSlug ?? page.kind,
              detectedContent: "Unable to inspect image",
              confidence: 0,
              explanation: `Semantic check error: ${err.message ?? String(err)}`,
              analysisMethod: "none",
              checkedAt: new Date().toISOString(),
            },
          },
        };
      });
    } finally {
      setCheckingSemanticIndices((cur) => {
        const next = new Set(cur);
        next.delete(index);
        return next;
      });
    }
  }

  function handleApproveSemantic(index: number, reason?: string) {
    setIllustrations((cur) => {
      const prev = cur[index];
      if (!prev || !prev.semanticValidation) return cur;
      return {
        ...cur,
        [index]: {
          ...prev,
          semanticValidation: {
            ...prev.semanticValidation,
            // Preserve original status (e.g. POSSIBLE_MISMATCH) — do not rewrite to MATCH!
            userApprovedManualOverride: true,
            overrideTimestamp: new Date().toISOString(),
            overrideReason: reason || "User confirmed visual alignment",
          },
        },
      };
    });
  }

  function handleSwapSlots(slotAIndex: number, slotBIndex: number) {
    invalidateSlotAcknowledgement(slotAIndex);
    invalidateSlotAcknowledgement(slotBIndex);
    setIllustrations((cur) => {
      const itemA = cur[slotAIndex];
      const itemB = cur[slotBIndex];
      if (!itemA || !itemB) return cur;
      return {
        ...cur,
        [slotAIndex]: itemB,
        [slotBIndex]: itemA,
      };
    });
  }

  const eligiblePages = useMemo(() => {
    return pages.filter((p) => {
      const entry = illustrations[p.index];
      if (!entry || entry.status === "missing" || !entry.file) return false;
      const prov = entry.provenance;
      if (!prov) return true;
      if (prov.enhancementMethod === "none") return true;
      return prov.nativeEffectivePpi < 300 && prov.enhancementStatus !== "approved";
    });
  }, [pages, illustrations]);

  async function onBatchAutoFix(retryPages?: ManualPage[]) {
    const targets = retryPages ?? eligiblePages;
    if (targets.length === 0) {
      return;
    }

    const provRes = await fetch("/api/enhance");
    const provData = await provRes.json().catch(() => ({}));
    const isAvail = provData.isAvailable && (provData.provider?.isConfigured || provData.provider?.available);
    if (!isAvail) {
      setEnhancerAvailable(false);
      setActiveProvider(null);
      return;
    }
    setEnhancerAvailable(true);
    setActiveProvider(provData.provider);

    let userConfirmedPaid = false;
    if (provData.provider?.isPaid) {
      const costPerImage = provData.provider.estimatedCostUsd ?? provData.costEstimate?.estimatedCostUsd ?? 0.04;
      const totalCost = (costPerImage * targets.length).toFixed(2);
      const proceed = window.confirm(
        `Batch resolution enhancement will process ${targets.length} image(s) using paid provider "${provData.provider.name}".\n` +
        `Estimated cost: $${totalCost} USD ($${costPerImage}/image).\n\n` +
        `Proceed with batch enhancement?`
      );
      if (!proceed) return;
      userConfirmedPaid = true;
    }

    batchEnhanceCancelRef.current = false;
    setBatchEnhancing(true);
    setFailedEnhanceIndices([]);

    const totalCount = targets.length;
    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let runningCount = 0;
    const failedList: number[] = [];

    setBatchEnhanceProgress({
      total: totalCount,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });

    const queue = [...targets];

    const worker = async () => {
      while (queue.length > 0) {
        if (batchEnhanceCancelRef.current) {
          cancelledCount += queue.length;
          queue.length = 0;
          break;
        }
        const page = queue.shift();
        if (!page) break;

        runningCount++;
        setBatchEnhanceProgress({
          total: totalCount,
          running: runningCount,
          completed: completedCount,
          failed: failedCount,
          cancelled: cancelledCount,
        });

        try {
          const result = await handleAutoFixResolution(page.index, true, userConfirmedPaid, provData.provider.id);
          if (result.success) {
            completedCount++;
          } else {
            failedCount++;
            failedList.push(page.index);
          }
        } catch {
          failedCount++;
          failedList.push(page.index);
        } finally {
          runningCount--;
          setBatchEnhanceProgress({
            total: totalCount,
            running: runningCount,
            completed: completedCount,
            failed: failedCount,
            cancelled: cancelledCount,
          });
        }
      }
    };

    // Run 1 worker for local GPU AI to prevent VRAM thrashing and timeouts; up to 2 for external APIs
    const isLocal = provData.provider?.providerClass === "local-ai" || activeProvider?.providerClass === "local-ai";
    const workerCount = isLocal ? 1 : Math.min(2, queue.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    setBatchEnhancing(false);
    setFailedEnhanceIndices(failedList);
    setBatchEnhanceProgress({
      total: totalCount,
      running: 0,
      completed: completedCount,
      failed: failedCount,
      cancelled: cancelledCount,
    });
    void runPreflightCheck();
  }

  function handleApplyLegacyRemap() {
    setSavedPreRemapIllustrations(illustrations);

    const currentFilesBySlot: Record<string, { filename: string; file?: File }> = {};
    for (const p of pages) {
      const entry = illustrations[p.index];
      const slotId = p.resolvedSlot?.slotId ?? p.filename;
      if (slotId && entry?.file) {
        currentFilesBySlot[slotId] = { filename: p.filename, file: entry.file };
      }
    }

    const { entries } = calculateLegacyDreamBigRemap(currentFilesBySlot);

    setIllustrations((cur) => {
      const next: Record<number, IllustrationEntry> = { ...cur };

      for (const mapping of entries) {
        const destPage = pages.find(
          (p) => (p.resolvedSlot?.slotId ?? p.filename) === mapping.destinationSlotId
        );
        const sourcePage = pages.find(
          (p) => (p.resolvedSlot?.slotId ?? p.filename) === mapping.sourceSlotId
        );

        if (!destPage) continue;

        if (sourcePage && cur[sourcePage.index]?.file) {
          const sourceEntry = cur[sourcePage.index];
          next[destPage.index] = {
            ...sourceEntry,
            file: sourceEntry.file,
            objectUrl: sourceEntry.objectUrl,
            status: "added",
            needsRegeneration: false,
            provenance: sourceEntry.provenance ? {
              ...sourceEntry.provenance,
              legacyRecovered: true,
              enhancementStatus: "none",
              approvedAt: null,
            } : undefined,
          };
        }
      }

      return next;
    });

    setQualityAcknowledgements({});
    setIsLegacyRemapped(true);
    setLegacyRemapOpen(false);

    const generation = importGeneration.current();
    for (const p of pages) {
      const entry = illustrations[p.index];
      if (entry?.file) {
        void runClientCheck(p.index, entry.file, generation);
      }
    }

    setTimeout(() => {
      void runPreflightCheck({});
    }, 100);
  }

  function handleUndoLegacyRemap() {
    if (!savedPreRemapIllustrations) return;
    setIllustrations(savedPreRemapIllustrations);
    setSavedPreRemapIllustrations(null);
    setIsLegacyRemapped(false);
    setQualityAcknowledgements({});

    const generation = importGeneration.current();
    for (const p of pages) {
      const entry = savedPreRemapIllustrations[p.index];
      if (entry?.file) {
        void runClientCheck(p.index, entry.file, generation);
      }
    }

    setTimeout(() => {
      void runPreflightCheck({});
    }, 100);
  }

  async function onBatchCheckSemantic() {
    const eligible = pages.filter((p) => {
      const entry = illustrations[p.index];
      return entry && entry.status !== "missing" && entry.file;
    });

    if (eligible.length === 0) {
      alert("No illustrations uploaded to check.");
      return;
    }

    setBatchChecking(true);
    for (const page of eligible) {
      await handleCheckStoryMatch(page.index);
    }
    setBatchChecking(false);
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
    const provenancesObj: Record<string, ImageProvenanceMetadata> = {};
    const receiptsObj: Record<string, SignedEnhancementReceipt> = {};
    for (const p of pages) {
      const entry = illustrations[p.index];
      if (entry?.provenance) {
        const slotId = p.resolvedSlot?.slotId ?? p.filename;
        provenancesObj[slotId] = entry.provenance;
        provenancesObj[p.filename] = entry.provenance;
      }
      if (entry?.receipt) {
        const slotId = p.resolvedSlot?.slotId ?? p.filename;
        receiptsObj[slotId] = entry.receipt;
        receiptsObj[p.filename] = entry.receipt;
      }
    }
    if (Object.keys(provenancesObj).length > 0) {
      form.append("provenances", JSON.stringify(provenancesObj));
    }
    if (Object.keys(receiptsObj).length > 0) {
      form.append("receipts", JSON.stringify(receiptsObj));
    }
    const visualApprovalsObj: Record<string, SignedEnhancementApprovalRecord> = {};
    for (const p of pages) {
      const entry = illustrations[p.index];
      const approval = entry?.provenance?.approvalRecord;
      if (approval) {
        const slotId = p.resolvedSlot?.slotId ?? p.filename;
        visualApprovalsObj[slotId] = approval;
        visualApprovalsObj[p.filename] = approval;
      }
    }
    if (Object.keys(visualApprovalsObj).length > 0) {
      form.append("visualApprovals", JSON.stringify(visualApprovalsObj));
    }
    if (Object.keys(qualityAcknowledgements).length > 0) {
      form.append("qualityAcknowledgements", JSON.stringify(qualityAcknowledgements));
    }
    return form;
  }

  async function buildPdf(overrideAcknowledgeQualityWarnings?: boolean) {
    clearServerErrors();
    const form = buildExportForm();
    if (!form) return;
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

        // Capture pending quality warnings even on 400 mixed preflight failures
        if (data.qualityWarnings && data.qualityWarnings.length > 0) {
          setPendingQualityWarnings(data.qualityWarnings);
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
              slotId: item.slotId,
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

  async function downloadDraftPdf() {
    clearServerErrors();
    const form = buildExportForm();
    if (!form) return;
    form.append("draft", "true");
    setBusy(true);
    try {
      const res = await fetch("/api/assemble", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to generate draft PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.trim() || "storybook"}-${bookId}-DRAFT.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server for draft export.");
    } finally {
      setBusy(false);
    }
  }

  function handleAcknowledgeQualityWarnings() {
    const newAcks: Record<string, QualityAcknowledgementRecord> = { ...qualityAcknowledgements };
    const warningIssues = preflightIssues.filter((i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED");

    for (const issue of warningIssues) {
      const page = issue.illustrationNumber !== undefined
        ? pages.find((p) => p.index === issue.illustrationNumber)
        : pages.find((p) => p.filename === issue.filename);

      const slotId = issue.slotId || page?.resolvedSlot?.slotId || page?.filename || issue.filename;
      if (!slotId) continue;

      const entry = page ? illustrations[page.index] : undefined;
      const sha256 = entry?.provenance?.originalSha256 || "";
      const ppiVal = issue.actual
        ? Number(issue.actual.replace(/[^0-9.]/g, ""))
        : (entry?.provenance?.nativeEffectivePpi ?? 213);

      if (ppiVal >= 150 && ppiVal < 300) {
        newAcks[slotId] = {
          slotId,
          sourceSha256: sha256,
          imageSha256: sha256,
          bookId,
          profileId,
          layout: layoutMode,
          layoutMode,
          computedNativeEffectivePpi: ppiVal,
          nativeEffectivePpi: ppiVal,
          destinationDimensions: page?.resolvedSlot?.destinationDimensions,
          timestamp: new Date().toISOString(),
          acknowledgedAt: new Date().toISOString(),
        };
      }
    }

    setQualityAcknowledgements(newAcks);
    setPendingQualityWarnings(null);
    setTimeout(() => {
      void runPreflightCheck(newAcks);
    }, 50);
  }

  const runPreflightCheck = useCallback(async (customAcks?: Record<string, QualityAcknowledgementRecord>) => {
    const acksToUse = customAcks ?? qualityAcknowledgements;
    const form = buildExportForm();
    if (!form) return;
    form.append("preflightOnly", "true");
    if (Object.keys(acksToUse).length > 0) {
      form.append("qualityAcknowledgements", JSON.stringify(acksToUse));
    }
    try {
      const res = await fetch("/api/assemble", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
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
              slotId: item.slotId,
              expected: item.expected,
              actual: item.actual,
              recommendation: item.recommendation,
              message: item.message ?? (typeof item === "string" ? item : ""),
            });
          }
        }
        setPreflightIssues(structured);
      }
    } catch {
      /* ignore background preflight check failure */
    }
  }, [buildExportForm, qualityAcknowledgements]);

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
              slotId: item.slotId,
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

  const legacyRemapPreview = useMemo(() => {
    if (bookId !== "dream-big") return null;
    const currentFilesBySlot: Record<string, { filename: string; file?: File }> = {};
    for (const p of pages) {
      const entry = illustrations[p.index];
      const slotId = p.resolvedSlot?.slotId ?? p.filename;
      if (slotId && entry?.file) {
        currentFilesBySlot[slotId] = { filename: p.filename, file: entry.file };
      }
    }
    return calculateLegacyDreamBigRemap(currentFilesBySlot);
  }, [bookId, pages, illustrations]);

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

      {preflightIssues.length > 0 && (() => {
        const qualityWarningIssues = preflightIssues.filter(
          (i) => i.type === "QUALITY_WARNING_UNACKNOWLEDGED"
        );
        const lowPpiIssues = preflightIssues.filter(
          (i) => i.type === "LOW_PPI" || i.type === "IMAGE_RESOLUTION_TOO_LOW"
        );
        const aspectIssues = preflightIssues.filter(
          (i) => i.type === "ASPECT_RATIO_MISMATCH"
        );
        const semanticMismatchCount = pages.filter(
          (p) => illustrations[p.index]?.semanticValidation?.status === "POSSIBLE_MISMATCH"
        ).length;

        return (
          <div className={styles.preflightBlockedPanel} data-testid="preflight-blocked-panel">
            <div className={styles.preflightBlockedHeader}>
              <span>⛔</span>
              <span>Why export is blocked ({preflightIssues.length} {preflightIssues.length === 1 ? "issue" : "issues"})</span>
            </div>

            {/* Concise actionable summary above detailed issues */}
            <div className={styles.preflightSummaryCard} data-testid="preflight-actionable-summary">
              <div className={styles.preflightSummaryTitle}>
                <span>📊</span>
                <span>Preflight Quality & Gate Summary</span>
              </div>
              <ul className={styles.preflightSummaryList}>
                <li>
                  <strong>{qualityWarningIssues.length} {qualityWarningIssues.length === 1 ? "image requires" : "images require"} quality acknowledgement</strong> {qualityWarningIssues.length > 0 ? `(${Array.from(new Set(qualityWarningIssues.map((i) => i.actual).filter(Boolean))).join(", ")})` : ""}
                  {Object.keys(qualityAcknowledgements).length > 0 && qualityWarningIssues.length === 0 && (
                    <span style={{ color: "#047857", fontWeight: 600, marginLeft: "6px" }}>✓ Acknowledged</span>
                  )}
                </li>
                <li>
                  <strong>{lowPpiIssues.length} {lowPpiIssues.length === 1 ? "image requires" : "images require"} higher resolution or genuine AI enhancement</strong> {lowPpiIssues.length > 0 ? `(${Array.from(new Set(lowPpiIssues.map((i) => i.actual).filter(Boolean))).join(", ")})` : ""}
                </li>
                <li>
                  <strong>{aspectIssues.length} aspect-ratio {aspectIssues.length === 1 ? "problem" : "problems"}</strong>
                </li>
                {semanticMismatchCount > 0 && (
                  <li>
                    <strong>{semanticMismatchCount} semantic {semanticMismatchCount === 1 ? "mismatch" : "mismatches"}</strong> detected
                  </li>
                )}
              </ul>

              {/* Quality warning acknowledgement action */}
              {qualityWarningIssues.length > 0 && (
                <div className={styles.qualityAckBox} data-testid="quality-ack-box">
                  <div style={{ fontWeight: 600, color: "#92400e", marginBottom: "4px" }}>
                    ⚠️ Quality Warning Acknowledgement Available
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#78350f" }}>
                    {qualityWarningIssues.length} {qualityWarningIssues.length === 1 ? "image is" : "images are"} between 150–299 native PPI ({Array.from(new Set(qualityWarningIssues.map((i) => i.actual).filter(Boolean))).join(", ")}).
                    Acknowledgement allows production export with slightly reduced detail, but does <strong>not</strong> create native 300-PPI detail.
                  </p>
                  <button
                    type="button"
                    className={styles.sessionNewBook}
                    style={{ background: "#f59e0b", borderColor: "#d97706", color: "#ffffff", cursor: "pointer", fontWeight: 700 }}
                    onClick={handleAcknowledgeQualityWarnings}
                    data-testid="acknowledge-all-quality-warnings"
                  >
                    ✓ Acknowledge {qualityWarningIssues.length} quality {qualityWarningIssues.length === 1 ? "warning" : "warnings"} ({Array.from(new Set(qualityWarningIssues.map((i) => i.actual).filter(Boolean))).join(", ")})
                  </button>
                </div>
              )}

              {/* Below-150-PPI guidance */}
              {lowPpiIssues.length > 0 && (
                <div className={styles.lowPpiNoticeBox} data-testid="low-ppi-notice-box">
                  <div style={{ fontWeight: 600, color: "#b91c1c", marginBottom: "4px" }}>
                    🚫 Hard Quality Gate: {lowPpiIssues.length} {lowPpiIssues.length === 1 ? "image is" : "images are"} below 150 PPI
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#7f1d1d" }}>
                    Acknowledgement cannot bypass the 150-PPI production gate. You must replace, regenerate, or genuinely enhance these illustrations before production export.
                  </p>
                  {enhancerAvailable === false && (
                    <div style={{ fontSize: "12px", background: "#fef2f2", border: "1px dashed #f87171", padding: "6px 10px", borderRadius: "6px", color: "#991b1b" }}>
                      ℹ️ No production AI enhancer configured—replace/regenerate the image or download a draft PDF.
                    </div>
                  )}
                </div>
              )}

              {/* Download Draft PDF button */}
              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.sessionNewBook}
                    style={{ background: "#4b5563", borderColor: "#374151", color: "#ffffff", cursor: "pointer", fontWeight: 700 }}
                    onClick={() => void downloadDraftPdf()}
                    disabled={busy}
                    data-testid="download-draft-pdf-button"
                  >
                    {busy ? "Generating Draft…" : "📄 Download Draft PDF (Watermarked)"}
                  </button>
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Draft PDFs contain a visible "DRAFT / NOT FOR PRINT" watermark on every page and must not be sent to a printer.
                  </span>
                </div>
              </div>
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
        );
      })()}

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

          {/* Legacy Dream Big Content-Remap Recovery Banner */}
          {bookId === "dream-big" && pages.length >= 22 && (
            <div
              style={{
                margin: "14px 0 10px",
                padding: "12px 16px",
                background: "#fffbeb",
                border: "1px solid #f59e0b",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
              data-testid="legacy-dream-big-remap-banner"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <strong style={{ color: "#b45309", fontSize: "14px" }}>
                    🔄 Legacy Dream Big Artwork Offset Recovery
                  </strong>
                  <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#78350f" }}>
                    Older Dream Big illustration sets have a 1-page cyclic shift across pages 2–22 (Intro contains Pilot, Pilot contains Race-car, etc.).
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {!isLegacyRemapped ? (
                    <button
                      type="button"
                      className={styles.copyButton}
                      style={{ borderColor: "#f59e0b", color: "#b45309", fontWeight: 700, cursor: "pointer" }}
                      onClick={() => setLegacyRemapOpen(true)}
                      data-testid="open-legacy-remap-button"
                    >
                      Review & Apply Legacy Remap
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", color: "#047857", fontWeight: 700 }} data-testid="legacy-remapped-badge">
                        ✓ Legacy Remap Applied
                      </span>
                      <button
                        type="button"
                        className={styles.linkAction}
                        style={{ color: "#dc2626", fontWeight: 700, cursor: "pointer" }}
                        onClick={handleUndoLegacyRemap}
                        data-testid="undo-legacy-remap-button"
                      >
                        Undo Remap
                      </button>
                      <button
                        type="button"
                        className={styles.linkAction}
                        style={{ color: "#4b5563", fontWeight: 700, cursor: "pointer" }}
                        onClick={() => void downloadDraftPdf()}
                        data-testid="download-remapped-draft-button"
                      >
                        📄 Download Remapped Draft PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: "12px", color: "#92400e" }}>
                💡 Recommendation: Child identity and style may vary across older artwork. Generating new artwork with the latest prompts is recommended even when legacy remapping is available.
              </div>
            </div>
          )}

          {/* Legacy Dream Big Remap Modal */}
          {legacyRemapOpen && legacyRemapPreview && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
              }}
              data-testid="legacy-remap-modal"
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "12px",
                  maxWidth: "780px",
                  width: "100%",
                  maxHeight: "90vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ margin: 0, fontSize: "17px", color: "#1e293b" }}>
                    🔄 Reversible Legacy Dream Big Artwork Remap Proposal
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                    Resolves the cyclic offset in older packages where roles are shifted across pages 2–22.
                  </p>
                </div>

                <div style={{ padding: "16px 20px", overflowY: "auto", fontSize: "13px" }}>
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 14px", borderRadius: "6px", marginBottom: "14px", color: "#1e40af" }}>
                    <strong>Canonical Shift Mapping:</strong>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      <li><strong>Destination 02-intro</strong> receives old source <code>22-inventor.png</code> (generic dream artwork).</li>
                      <li><strong>Destinations 03 through 22</strong>: Destination N receives old source N−1 (restores correct roles).</li>
                      <li><strong>01-cover, 23-closing, and 24-backcover</strong> remain unchanged.</li>
                    </ul>
                  </div>

                  <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: "6px", marginBottom: "14px", color: "#92400e" }}>
                    <strong>⚠️ Important Safety Rules:</strong>
                    <div>• <strong>Reversible:</strong> Original files and state are preserved; click "Undo Remap" anytime to revert.</div>
                    <div>• <strong>Manual Visual Review Required:</strong> We do not claim automated semantic verification without a real Vision provider. Re-mapped pages must be visually reviewed and approved before production export.</div>
                    <div>• <strong>Watermarked Draft:</strong> You can download a watermarked draft PDF to verify the remapped sequence before production.</div>
                  </div>

                  <h4 style={{ margin: "12px 0 6px", fontSize: "14px" }}>Complete Source → Destination Mapping Preview:</h4>
                  <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12px" }}>
                      <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                        <tr>
                          <th style={{ padding: "6px 8px" }}>Dest Page</th>
                          <th style={{ padding: "6px 8px" }}>Dest Slot / Expected Role</th>
                          <th style={{ padding: "6px 8px" }}>Source Slot / Role</th>
                          <th style={{ padding: "6px 8px" }}>Source File</th>
                          <th style={{ padding: "6px 8px" }}>Shift Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legacyRemapPreview.entries.map((m) => (
                          <tr key={m.destinationSlotId} style={{ borderBottom: "1px solid #f1f5f9", background: m.isChanged ? "#fefce8" : "#ffffff" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700 }}>Page {m.destinationPageNumber}</td>
                            <td style={{ padding: "6px 8px" }}>{m.destinationSlotId} ({m.destinationRoleName})</td>
                            <td style={{ padding: "6px 8px" }}>{m.sourceSlotId} ({m.sourceOriginalRole})</td>
                            <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{m.sourceFilename}</td>
                            <td style={{ padding: "6px 8px", color: m.isChanged ? "#b45309" : "#64748b", fontWeight: m.isChanged ? 600 : 400 }}>
                              {m.destinationSlotId === "02-intro" ? "Shifted from Page 22" : m.isChanged ? "Shifted from N−1" : "Unchanged"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setLegacyRemapOpen(false)}
                    data-testid="cancel-legacy-remap-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    style={{ background: "#f59e0b", color: "#1c1440", fontWeight: 700, margin: 0 }}
                    onClick={handleApplyLegacyRemap}
                    data-testid="confirm-legacy-remap-button"
                  >
                    Apply Legacy Remap
                  </button>
                </div>
              </div>
            </div>
          )}

          {pages.length > 0 && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "14px 0 10px", alignItems: "center" }}>
              {enhancerAvailable === false || activeProvider === null ? (
                <button
                  className={styles.copyButton}
                  style={{ borderColor: "#9ca3af", color: "#6b7280", fontWeight: 700, cursor: "not-allowed" }}
                  disabled={true}
                  data-testid="batch-auto-fix-button"
                  title="No genuine super-resolution provider configured"
                >
                  ✨ Auto-fix unavailable (No real AI provider configured)
                </button>
              ) : (
                <button
                  className={styles.copyButton}
                  style={{ borderColor: "#8b5cf6", color: "#6d28d9", fontWeight: 700 }}
                  onClick={() => void onBatchAutoFix()}
                  disabled={batchEnhancing || batchChecking || eligiblePages.length === 0}
                  data-testid="batch-auto-fix-button"
                >
                  {batchEnhancing
                    ? `✨ Auto-fixing images (${batchEnhanceProgress?.running ?? 0} running, ${batchEnhanceProgress?.completed ?? 0}/${batchEnhanceProgress?.total ?? 0})…`
                    : `✨ Auto-fix all eligible (${eligiblePages.length} images via ${activeProvider.name} [${activeProvider.isPaid ? "Paid" : "Free Local AI"}])`}
                </button>
              )}
              <button
                className={styles.copyButton}
                style={{ borderColor: "#0284c7", color: "#0369a1", fontWeight: 700 }}
                onClick={() => void onBatchCheckSemantic()}
                disabled={batchEnhancing || batchChecking}
              >
                {batchChecking ? "🎯 Checking story matches…" : "🎯 Check all story matches"}
              </button>
              {pendingApprovalCount > 0 && (
                <button
                  className={styles.copyButton}
                  style={{ borderColor: "#10b981", color: "#047857", fontWeight: 700 }}
                  onClick={() => void handleApproveAllEnhancements()}
                  data-testid="batch-approve-all-button"
                >
                  ✓ Approve all reviewed enhancements ({pendingApprovalCount})
                </button>
              )}
            </div>
          )}

          {/* Super-Resolution Setup Instructions when Provider Unavailable */}
          {enhancerAvailable === false && (
            <div className={styles.instructions} style={{ borderLeft: "4px solid #f59e0b", margin: "10px 0" }} data-testid="provider-setup-instructions" data-cy="provider-setup-instructions-card">
              <div style={{ fontWeight: 700, color: "#b45309", marginBottom: "4px" }} data-testid="provider-setup-instructions-card">
                ⚠️ Super-Resolution Provider Setup Instructions
              </div>
              <div style={{ fontSize: "13px", color: "#78350f" }}>
                No genuine production super-resolution provider is currently available.
                <ul style={{ margin: "4px 0 0 16px" }}>
                  <li><strong>Free Local AI (Recommended):</strong> Place <code>realesrgan-ncnn-vulkan</code> executable and models into <code>tools/realesrgan/</code>, or set the <code>REAL_ESRGAN_BIN</code> environment variable in <code>.env.local</code>.</li>
                  <li><strong>Configured External AI:</strong> Set <code>ENHANCEMENT_API_URL</code> and <code>ENHANCEMENT_API_KEY</code> in <code>.env.local</code>.</li>
                </ul>
                Bicubic/Lanczos resizing and mock providers are strictly prohibited in production.
              </div>
            </div>
          )}

          {batchEnhanceProgress && (
            <div className={styles.batchProgressCard} data-testid="batch-progress-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                <strong data-testid="batch-progress-title">
                  {batchEnhancing ? "Batch Resolution Enhancement in Progress…" : "Batch Enhancement Complete"}
                </strong>
                <span data-testid="batch-counts-summary">
                  <span data-testid="batch-running-count">{batchEnhanceProgress.running}</span> running,{" "}
                  <span data-testid="batch-completed-count">{batchEnhanceProgress.completed}</span> completed,{" "}
                  <span data-testid="batch-failed-count">{batchEnhanceProgress.failed}</span> failed,{" "}
                  <span data-testid="batch-cancelled-count">{batchEnhanceProgress.cancelled}</span> cancelled
                  {" "}of <span data-testid="batch-total-count">{batchEnhanceProgress.total}</span> total
                </span>
              </div>
              <div className={styles.batchProgressBar}>
                <div
                  className={styles.batchProgressFill}
                  style={{
                    width: `${Math.round(((batchEnhanceProgress.completed + batchEnhanceProgress.failed + batchEnhanceProgress.cancelled) / Math.max(1, batchEnhanceProgress.total)) * 100)}%`,
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                {failedEnhanceIndices.length > 0 && !batchEnhancing && (
                  <button
                    type="button"
                    className={styles.linkAction}
                    style={{ color: "#b91c1c", fontWeight: 700, cursor: "pointer" }}
                    onClick={() => void onBatchAutoFix(failedEnhanceIndices.map((idx) => pages[idx]).filter(Boolean))}
                    data-testid="retry-failed-batch-button"
                  >
                    Retry {failedEnhanceIndices.length} failed
                  </button>
                )}
                {batchEnhancing ? (
                  <button
                    type="button"
                    className={styles.linkAction}
                    style={{ color: "#ef4444", cursor: "pointer" }}
                    onClick={() => {
                      batchEnhanceCancelRef.current = true;
                    }}
                    data-testid="cancel-batch-button"
                  >
                    Cancel remaining
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.linkAction}
                    style={{ color: "#4b5563", cursor: "pointer" }}
                    onClick={() => {
                      setBatchEnhanceProgress(null);
                      setFailedEnhanceIndices([]);
                    }}
                    data-testid="dismiss-batch-button"
                  >
                    Dismiss
                  </button>
                )}
              </div>
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
                onAutoFixResolution={() => void handleAutoFixResolution(p.index)}
                onApproveEnhancement={() => handleApproveEnhancement(p.index)}
                onRevertEnhancement={() => handleRevertEnhancement(p.index)}
                onCheckStoryMatch={() => void handleCheckStoryMatch(p.index)}
                onApproveSemantic={() => handleApproveSemantic(p.index)}
                onSwapSlot={(targetIndex) => handleSwapSlots(p.index, targetIndex)}
                availableSwapPages={pages}
                isEnhancing={enhancingIndices.has(p.index)}
                isCheckingSemantic={checkingSemanticIndices.has(p.index)}
                enhancerAvailable={enhancerAvailable === true}
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
          onExportDraft={() => void downloadDraftPdf()}
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

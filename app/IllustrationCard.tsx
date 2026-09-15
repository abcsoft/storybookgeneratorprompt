"use client";

import { useRef, useState } from "react";
import type { IllustrationEntry, ManualPage } from "./ManualFlow";
import { derivePrimaryBadge } from "@/lib/manual/illustrationStatus";
import { statusClassName } from "./statusStyles";
import styles from "./page.module.css";

/** One illustration's review card — compact by default: number,
 *  pages, scene title, aspect, filename, status, thumbnail, resolution
 *  provenance, enhancement actions, and semantic validation. */
export default function IllustrationCard({
  page,
  pageLabel,
  entry,
  copied,
  onCopyPrompt,
  onReplace,
  onRemove,
  onApprove,
  onMarkNeedsRegeneration,
  onClearNeedsRegeneration,
  onOpenCorrection,
  onOpenFramingEditor,
  onAutoFixResolution,
  onApproveEnhancement,
  onRevertEnhancement,
  onCheckStoryMatch,
  onApproveSemantic,
  onSwapSlot,
  availableSwapPages,
  isEnhancing,
  isCheckingSemantic,
  enhancerAvailable,
}: {
  page: ManualPage;
  pageLabel: string;
  entry: IllustrationEntry;
  copied: boolean;
  onCopyPrompt: () => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
  onApprove: () => void;
  onMarkNeedsRegeneration: () => void;
  onClearNeedsRegeneration?: () => void;
  onOpenCorrection: () => void;
  onOpenFramingEditor?: () => void;
  onAutoFixResolution?: () => void;
  onApproveEnhancement?: () => void;
  onRevertEnhancement?: () => void;
  onCheckStoryMatch?: () => void;
  onApproveSemantic?: () => void;
  onSwapSlot?: (targetSlotIndex: number) => void;
  availableSwapPages?: ManualPage[];
  isEnhancing?: boolean;
  isCheckingSemantic?: boolean;
  enhancerAvailable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareZoom, setCompareZoom] = useState<1 | 2 | 4>(1);
  const [showSwapSelect, setShowSwapSelect] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const hasImage = entry.status !== "missing";
  const hasCustomTransform =
    entry.transform &&
    (entry.transform.mode === "manual" ||
      entry.transform.scale !== 1.0 ||
      entry.transform.offsetX !== 0 ||
      entry.transform.offsetY !== 0);

  const primaryBadge = derivePrimaryBadge({
    status: entry.status,
    needsRegeneration: entry.needsRegeneration || entry.status === "needs-regeneration",
    hasCustomTransform: !!hasCustomTransform,
  });

  const prov = entry.provenance;
  const nativePpi = prov ? Math.round(prov.nativeEffectivePpi) : null;
  const isEnhanced = prov && prov.enhancementMethod !== "none";
  const needsVisualApproval =
    prov &&
    prov.approvalRequired &&
    (prov.enhancementStatus === "enhanced" || prov.enhancementStatus === "pending");

  return (
    <div className={styles.illoCard}>
      <div className={styles.illoThumbWrap}>
        {entry.objectUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.objectUrl} alt="" className={styles.illoThumb} />
        ) : (
          <div className={styles.illoThumbEmpty} aria-hidden="true">
            🖼️
          </div>
        )}
      </div>

      <div className={styles.illoBody}>
        <div className={styles.illoHead}>
          <span className={styles.illoNumber}>
            Illustration {String(page.page).padStart(2, "0")}
          </span>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span
              className={`${styles.statusBadge} ${
                primaryBadge.kind === "adjusted" ? styles.statusAdjusted : statusClassName(entry.status)
              }`}
            >
              {primaryBadge.label}
            </span>

            {/* Quality badge based on native PPI */}
            {nativePpi !== null && (
              nativePpi < 150 ? (
                <span className={styles.qualityBadgeBlocked}>
                  🚫 {nativePpi} native PPI
                </span>
              ) : nativePpi < 200 ? (
                <span className={styles.qualityBadgeRecommend}>
                  ⚠️ {nativePpi} native PPI
                </span>
              ) : nativePpi < 300 ? (
                <span className={styles.qualityBadgeAcceptable}>
                  ℹ️ {nativePpi} native PPI
                </span>
              ) : (
                <span className={styles.qualityBadgeDirect}>
                  ✅ {nativePpi} native PPI
                </span>
              )
            )}

            {/* Enhancement state badge */}
            {isEnhanced && (
              prov.enhancementStatus === "approved" ? (
                <span className={styles.qualityBadgeDirect}>
                  ✨ {prov.enhancementMethod} approved
                </span>
              ) : needsVisualApproval ? (
                <span
                  className={styles.qualityBadgeRecommend}
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowCompareModal(true)}
                  title="Click to review and approve enhancement"
                >
                  👁️ Approval Needed ({prov.upscaleFactor.toFixed(1)}x)
                </span>
              ) : (
                <span className={styles.qualityBadgeAcceptable}>
                  ⚙️ {prov.enhancementMethod}
                </span>
              )
            )}
          </div>
        </div>

        <div className={styles.illoMeta}>
          {pageLabel} · {page.role ?? page.kind.toUpperCase()} ·{" "}
          {page.spread ? `${page.aspect} spread` : (page.aspect ?? "4:3")}
          <span className={styles.promptFile}> {page.filename}</span>
        </div>

        {/* Detailed provenance information */}
        {prov && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--ink-muted, #4b5563)",
              background: "var(--surface-2, #f9fafb)",
              padding: "6px 10px",
              borderRadius: "6px",
              margin: "6px 0",
              lineHeight: 1.4,
              border: "1px solid var(--border, #e5e7eb)",
            }}
          >
            <div>
              <strong>Original:</strong> {prov.originalPixelDimensions?.width ?? 1200}×{prov.originalPixelDimensions?.height ?? 880} px ({nativePpi} native PPI)
              {prov.originalSha256 && (
                <span style={{ fontFamily: "monospace", fontSize: "11px", opacity: 0.8 }} title={prov.originalSha256}>
                  {" "}· SHA: {prov.originalSha256.slice(0, 8)}…
                </span>
              )}
            </div>
            <div>
              <strong>Output Grid:</strong> {prov.outputGridPpi ?? 300} PPI ({page.resolvedSlot?.destinationDimensions?.width ?? 3375}×{page.resolvedSlot?.destinationDimensions?.height ?? 2475} px)
            </div>
            {isEnhanced && (
              <div>
                <strong>Enhancement:</strong> {prov.enhancementMethod === "resampled" ? "resampled (Lanczos)" : prov.enhancementMethod} ({prov.upscaleFactor.toFixed(2)}x) · Status: <em>{prov.enhancementStatus}</em>
                {prov.enhancedPixelDimensions && ` · ${prov.enhancedPixelDimensions.width}×${prov.enhancedPixelDimensions.height} px`}
                {prov.enhancedSha256 && (
                  <span style={{ fontFamily: "monospace", fontSize: "11px", opacity: 0.8 }} title={prov.enhancedSha256}>
                    {" "}· SHA: {prov.enhancedSha256.slice(0, 8)}…
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Aspect ratio warning */}
        {entry.clientCheck && entry.clientCheck.aspectStatus !== "ok" && (
          <div className={styles.illoWarning}>
            {!entry.clientCheck.readable
              ? "⚠️ Couldn't read this image file."
              : entry.clientCheck.aspectStatus === "error"
                ? "🚫 This orientation won't work for this page — see Book Review for the exact composition, or regenerate with a different orientation."
                : "⚠️ Aspect ratio doesn't closely match this page — check the final composition in Book Review before printing."}
          </div>
        )}

        {/* Semantic validation display */}
        {entry.semanticValidation && entry.semanticValidation.status === "MATCH" && (
          <div className={styles.semanticMatchCard}>
            ✅ Story match verified: aligns with <strong>{entry.semanticValidation.expectedRole}</strong>
            {entry.semanticValidation.analysisMethod && (
              <span style={{ fontSize: "11px", opacity: 0.85, marginLeft: "6px" }}>
                ({entry.semanticValidation.analysisMethod})
              </span>
            )}
          </div>
        )}

        {entry.semanticValidation && entry.semanticValidation.status === "NOT_CHECKED" && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--ink-muted, #4b5563)",
              background: "var(--surface-2, #f9fafb)",
              padding: "6px 10px",
              borderRadius: "6px",
              margin: "6px 0",
              border: "1px dashed var(--border, #d1d5db)",
            }}
          >
            ℹ️ Story match not verified: {entry.semanticValidation.explanation ?? "No AI vision provider configured"}
          </div>
        )}

        {entry.semanticValidation && entry.semanticValidation.status === "POSSIBLE_MISMATCH" && (
          <div className={styles.semanticMismatchCard}>
            <div className={styles.semanticTitle}>
              ⚠️ Possible Story Mismatch Detected
              {entry.semanticValidation.userApprovedManualOverride && (
                <span style={{ marginLeft: "8px", fontSize: "12px", color: "#047857", fontWeight: "normal" }}>
                  (Manually Approved)
                </span>
              )}
            </div>
            <div className={styles.semanticDetails}>
              <div><strong>Expected:</strong> {entry.semanticValidation.expectedRole}</div>
              {entry.semanticValidation.detectedContent && (
                <div><strong>Detected:</strong> {entry.semanticValidation.detectedContent}</div>
              )}
              <div><strong>Analysis:</strong> {entry.semanticValidation.explanation}</div>
              {entry.semanticValidation.analysisMethod && (
                <div style={{ fontSize: "11px", opacity: 0.8 }}>
                  Method: {entry.semanticValidation.analysisMethod}
                </div>
              )}
              {entry.semanticValidation.userApprovedManualOverride && (
                <div style={{ marginTop: "6px", color: "#065f46", fontSize: "12px", background: "#ecfdf5", padding: "4px 8px", borderRadius: "4px" }}>
                  ✔️ <strong>User Override:</strong> {entry.semanticValidation.overrideReason ?? "Visual match confirmed by user"}
                </div>
              )}
            </div>
            <div className={styles.semanticActions}>
              {onSwapSlot && availableSwapPages && availableSwapPages.length > 0 && (
                <>
                  <button
                    className={styles.semanticActionBtn}
                    onClick={() => setShowSwapSelect((v) => !v)}
                  >
                    🔀 Swap with slot…
                  </button>
                  {showSwapSelect && (
                    <select
                      className={styles.semanticActionBtn}
                      style={{ background: "#ffffff", padding: "4px" }}
                      onChange={(e) => {
                        const targetIdx = Number(e.target.value);
                        if (!isNaN(targetIdx)) {
                          onSwapSlot(targetIdx);
                          setShowSwapSelect(false);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Choose target slot</option>
                      {availableSwapPages
                        .filter((p) => p.index !== page.index)
                        .map((p) => (
                          <option key={p.index} value={p.index}>
                            Page {p.page} ({p.role ?? p.filename})
                          </option>
                        ))}
                    </select>
                  )}
                </>
              )}
              <button
                className={styles.semanticActionBtn}
                onClick={() => replaceInputRef.current?.click()}
              >
                🔄 Replace image
              </button>
              <button
                className={styles.semanticActionBtn}
                onClick={onMarkNeedsRegeneration}
              >
                ⚡ Mark needs regeneration
              </button>
              {onApproveSemantic && !entry.semanticValidation.userApprovedManualOverride && (
                <button
                  className={styles.semanticActionBtn}
                  style={{ borderColor: "#10b981", color: "#047857" }}
                  onClick={onApproveSemantic}
                >
                  ✔️ Approve anyway
                </button>
              )}
            </div>
          </div>
        )}

        {entry.semanticValidation && entry.semanticValidation.status === "CHECK_FAILED" && (
          <div className={styles.semanticMismatchCard} style={{ borderColor: "#ef4444", background: "#fef2f2" }}>
            <div className={styles.semanticTitle} style={{ color: "#b91c1c" }}>⚠️ Story Match Verification Failed</div>
            <div className={styles.semanticDetails} style={{ color: "#7f1d1d" }}>
              {entry.semanticValidation.explanation ?? entry.semanticValidation.detectedContent ?? "Verification check encountered an error."}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className={styles.illoActions}>
          <button className={styles.copyButton} onClick={onCopyPrompt}>
            {copied ? "Copied!" : "Copy Prompt"}
          </button>
          <button className={styles.copyButton} onClick={onOpenCorrection}>
            Fix Image
          </button>

          {/* Auto-fix resolution button or unavailable notice */}
          {hasImage && !isEnhanced && (
            enhancerAvailable === false ? (
              nativePpi !== null && nativePpi < 150 ? (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#991b1b",
                    background: "#fef2f2",
                    border: "1px dashed #fca5a5",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    lineHeight: 1.3,
                    gridColumn: "1 / -1",
                  }}
                  data-testid={`no-enhancer-notice-${page.page}`}
                >
                  No production AI enhancer configured—replace/regenerate the image or download a draft PDF.
                </div>
              ) : null
            ) : onAutoFixResolution ? (
              <button
                className={styles.copyButton}
                style={{ borderColor: "#8b5cf6", color: "#6d28d9", fontWeight: 600 }}
                onClick={onAutoFixResolution}
                disabled={isEnhancing}
                data-testid={`auto-fix-btn-${page.page}`}
              >
                {isEnhancing ? "✨ Enhancing…" : "✨ Auto-fix resolution"}
              </button>
            ) : null
          )}

          {/* Enhanced review & revert actions */}
          {hasImage && isEnhanced && (
            <>
              <button
                className={styles.copyButton}
                style={{ borderColor: "#8b5cf6", color: "#6d28d9", fontWeight: 700 }}
                onClick={() => setShowCompareModal(true)}
              >
                👁️ Review enhancement
              </button>
              {onRevertEnhancement && (
                <button
                  className={styles.copyButton}
                  onClick={onRevertEnhancement}
                  title="Revert back to original uploaded image"
                >
                  ↩️ Revert
                </button>
              )}
            </>
          )}

          {/* Check story match button */}
          {hasImage && onCheckStoryMatch && (
            <button
              className={styles.copyButton}
              style={{ borderColor: "#0284c7", color: "#0369a1" }}
              onClick={onCheckStoryMatch}
              disabled={isCheckingSemantic}
            >
              {isCheckingSemantic ? "🎯 Checking…" : "🎯 Check story match"}
            </button>
          )}

          {onOpenFramingEditor && (
            <button
              className={styles.copyButton}
              style={{ borderColor: "var(--star)", color: "var(--ink)", fontWeight: 700 }}
              onClick={onOpenFramingEditor}
              disabled={!hasImage}
            >
              🖼️ Adjust framing
            </button>
          )}
          <button
            className={styles.copyButton}
            onClick={onApprove}
            disabled={!hasImage}
          >
            Approve
          </button>
          <button
            className={styles.copyButton}
            onClick={() => replaceInputRef.current?.click()}
          >
            Replace
          </button>
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReplace(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className={styles.illoSecondaryActions}>
          {entry.status === "needs-regeneration" || entry.needsRegeneration ? (
            <button className={styles.linkAction} style={{ color: "#ffd36b" }} onClick={onClearNeedsRegeneration}>
              Undo regeneration request ✕
            </button>
          ) : (
            <button className={styles.linkAction} onClick={onMarkNeedsRegeneration} disabled={!hasImage}>
              Mark needs regeneration
            </button>
          )}
          <button className={styles.linkAction} onClick={onRemove} disabled={!hasImage}>
            Remove
          </button>
          <button className={styles.linkAction} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide full prompt" : "View full prompt"}
          </button>
        </div>

        {expanded && <p className={styles.promptText}>{page.prompt}</p>}
      </div>

      {/* Visual Approval Comparison Modal */}
      {showCompareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCompareModal(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                Resolution Enhancement Preview & Approval — Illustration {String(page.page).padStart(2, "0")}
              </h3>
              <button
                className={styles.linkAction}
                style={{ fontSize: "18px", cursor: "pointer" }}
                onClick={() => setShowCompareModal(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Inspection Zoom:</span>
                <button
                  style={{
                    fontWeight: compareZoom === 1 ? "bold" : "normal",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    background: compareZoom === 1 ? "#e5e7eb" : "#ffffff",
                    cursor: "pointer",
                  }}
                  onClick={() => setCompareZoom(1)}
                >
                  1× (Fit)
                </button>
                <button
                  style={{
                    fontWeight: compareZoom === 2 ? "bold" : "normal",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    background: compareZoom === 2 ? "#e5e7eb" : "#ffffff",
                    cursor: "pointer",
                  }}
                  onClick={() => setCompareZoom(2)}
                >
                  2× (100% Pixels)
                </button>
                <button
                  style={{
                    fontWeight: compareZoom === 4 ? "bold" : "normal",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    background: compareZoom === 4 ? "#e5e7eb" : "#ffffff",
                    cursor: "pointer",
                  }}
                  onClick={() => setCompareZoom(4)}
                >
                  4× (High Detail)
                </button>
              </div>

              <div className={styles.compareGrid}>
                <div className={styles.comparePanel}>
                  <div className={styles.comparePanelTitle}>
                    Original ({prov?.originalPixelDimensions.width}×{prov?.originalPixelDimensions.height} px · {nativePpi} native PPI)
                  </div>
                  <div className={styles.compareImageWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.originalObjectUrl ?? entry.objectUrl ?? ""}
                      alt="Original"
                      style={{
                        transform: `scale(${compareZoom})`,
                        transformOrigin: "center center",
                        transition: "transform 0.15s ease",
                        maxWidth: compareZoom === 1 ? "100%" : "none",
                        maxHeight: compareZoom === 1 ? "360px" : "none",
                      }}
                    />
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: "12px", color: "#6b7280" }}>
                    SHA-256: <code>{prov?.originalSha256?.slice(0, 16)}…</code>
                  </div>
                </div>

                <div className={styles.comparePanel}>
                  <div className={styles.comparePanelTitle}>
                    Enhanced ({prov?.enhancedPixelDimensions?.width ?? 3375}×{prov?.enhancedPixelDimensions?.height ?? 2475} px · {prov?.outputGridPpi ?? 300} PPI output)
                  </div>
                  <div className={styles.compareImageWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.objectUrl ?? ""}
                      alt="Enhanced"
                      style={{
                        transform: `scale(${compareZoom})`,
                        transformOrigin: "center center",
                        transition: "transform 0.15s ease",
                        maxWidth: compareZoom === 1 ? "100%" : "none",
                        maxHeight: compareZoom === 1 ? "360px" : "none",
                      }}
                    />
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: "12px", color: "#6b7280" }}>
                    Method: <strong>{prov?.enhancementMethod}</strong> ({prov?.upscaleFactor.toFixed(2)}x) · SHA-256: <code>{prov?.enhancedSha256?.slice(0, 16)}…</code>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {onRevertEnhancement && (
                <button
                  className={styles.copyButton}
                  onClick={() => {
                    onRevertEnhancement();
                    setShowCompareModal(false);
                  }}
                >
                  ↩️ Revert to Original
                </button>
              )}
              {onApproveEnhancement && (
                <button
                  className={styles.button}
                  style={{ margin: 0, padding: "8px 16px" }}
                  onClick={() => {
                    onApproveEnhancement();
                    setShowCompareModal(false);
                  }}
                >
                  ✅ Approve Visual Quality
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

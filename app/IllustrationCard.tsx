"use client";

import { useRef, useState } from "react";
import type { IllustrationEntry, ManualPage } from "./ManualFlow";
import { derivePrimaryBadge, STATUS_LABELS } from "@/lib/manual/illustrationStatus";
import { statusClassName } from "./statusStyles";
import styles from "./page.module.css";

/** One illustration's review card — compact by default (item 9): number,
 *  pages, scene title, aspect, filename, status, thumbnail. The full raw
 *  prompt only appears under "View full prompt". */
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
}) {
  const [expanded, setExpanded] = useState(false);
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
          <span
            className={`${styles.statusBadge} ${
              primaryBadge.kind === "adjusted" ? styles.statusAdjusted : statusClassName(entry.status)
            }`}
          >
            {primaryBadge.label}
          </span>
        </div>
        <div className={styles.illoMeta}>
          {pageLabel} · {page.role ?? page.kind.toUpperCase()} ·{" "}
          {page.spread ? `${page.aspect} spread` : (page.aspect ?? "3:2")}
          <span className={styles.promptFile}> {page.filename}</span>
        </div>

        {entry.clientCheck && entry.clientCheck.aspectStatus !== "ok" && (
          <div className={styles.illoWarning}>
            {!entry.clientCheck.readable
              ? "⚠️ Couldn't read this image file."
              : entry.clientCheck.aspectStatus === "error"
                ? "🚫 This orientation won't work for this page — see Book Review for the exact composition, or regenerate with a different orientation."
                : "⚠️ Aspect ratio doesn't closely match this page — check the final composition in Book Review before printing."}
          </div>
        )}

        <div className={styles.illoActions}>
          <button className={styles.copyButton} onClick={onCopyPrompt}>
            {copied ? "Copied!" : "Copy Prompt"}
          </button>
          <button className={styles.copyButton} onClick={onOpenCorrection}>
            Fix Image
          </button>
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
    </div>
  );
}

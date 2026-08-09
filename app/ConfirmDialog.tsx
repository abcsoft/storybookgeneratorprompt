"use client";

import styles from "./page.module.css";

/** Small reusable confirmation modal — reuses the same `.modalOverlay`/
 *  `.modalCard` styling CorrectionPanel.tsx and BookReview.tsx's preview
 *  already use, so this doesn't introduce a second design system. Used for
 *  every destructive session action (item 2/3/4/5): Clear images, Reset
 *  review, Start new book, New child same story, Change story. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Rendered as one paragraph per non-empty line. */
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for the most destructive actions. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onCancel}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <strong>{title}</strong>
        </div>
        {message
          .split("\n")
          .filter((line) => line.trim())
          .map((line, i) => (
            <p key={i} className={styles.steps}>
              {line}
            </p>
          ))}
        <div className={styles.toolbar}>
          <button className={styles.secondaryButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? styles.buttonDanger : styles.button}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

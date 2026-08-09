"use client";

import { useState } from "react";
import {
  buildCorrectionPrompt,
  CORRECTION_ISSUES,
  type CorrectionIssue,
} from "@/lib/story/prompt/buildCorrectionPrompt";
import type { ManualPage } from "./ManualFlow";
import styles from "./page.module.css";

/** Issue-flag picker + "Copy correction prompt" (item 4). Never touches the
 *  story scene — it only wraps `page.prompt` (the original) with the
 *  selected fix instructions. */
export default function CorrectionPanel({
  page,
  onClose,
  onMarkNeedsRegeneration,
}: {
  page: ManualPage;
  onClose: () => void;
  onMarkNeedsRegeneration: () => void;
}) {
  const [issues, setIssues] = useState<CorrectionIssue[]>([]);
  const [customNote, setCustomNote] = useState("");
  const [copied, setCopied] = useState(false);

  function toggle(id: CorrectionIssue) {
    setIssues((cur) => (cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id]));
  }

  async function copyCorrection() {
    const prompt = buildCorrectionPrompt({
      originalPrompt: page.prompt,
      issues,
      customNote: customNote.trim() || undefined,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHead}>
          <strong>
            Fix Illustration {String(page.page).padStart(2, "0")} · {page.filename}
          </strong>
          <button className={styles.linkAction} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.steps}>What's wrong with this image? Select every issue that applies.</p>

        <div className={styles.issueGrid}>
          {CORRECTION_ISSUES.map((issue) => (
            <label key={issue.id} className={styles.issueOption}>
              <input
                type="checkbox"
                checked={issues.includes(issue.id)}
                onChange={() => toggle(issue.id)}
              />
              {issue.label}
            </label>
          ))}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="custom-issue-note">
            Custom issue <span className={styles.hint}>(optional)</span>
          </label>
          <input
            id="custom-issue-note"
            className={styles.input}
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="Describe anything else that's wrong…"
          />
        </div>

        <div className={styles.toolbar}>
          <button className={styles.button} onClick={copyCorrection}>
            {copied ? "Copied!" : "Copy correction prompt"}
          </button>
        </div>
        <p className={styles.steps}>
          Paste this into the same Gemini chat (with the character reference still
          attached) to regenerate just this page.
        </p>

        <button
          className={styles.secondaryButton}
          onClick={() => {
            onMarkNeedsRegeneration();
            onClose();
          }}
        >
          Mark needs regeneration &amp; close
        </button>
      </div>
    </div>
  );
}

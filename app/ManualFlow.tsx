"use client";

import { useState } from "react";
import ProfileFields, { type Gender } from "./ProfileFields";
import styles from "./page.module.css";

interface ManualPage {
  page: number;
  index: number;
  kind: string;
  role?: string;
  filename: string;
  prompt: string;
  text: string;
  aspect?: string;
  spread?: boolean;
}

type Step = "profile" | "prompts";

/** Free flow: get prompts, generate images yourself, upload them to build the PDF. */
export default function ManualFlow({ bookId }: { bookId: string }) {
  const [step, setStep] = useState<Step>("profile");
  const [name, setName] = useState("");
  const [age, setAge] = useState("4");
  const [gender, setGender] = useState<Gender>("boy");

  const [pages, setPages] = useState<ManualPage[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [anchorPrompt, setAnchorPrompt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function getPrompts() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your child's name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), age, gender, bookId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not build prompts.");
        return;
      }
      setPages(data.pages);
      setMarkdown(data.markdown);
      setAnchorPrompt(data.anchorPrompt ?? "");
      setStep("prompts");
    } catch {
      setError("Could not reach the server.");
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

  function onImages(list: FileList | null) {
    if (!list) return;
    setImages(Array.from(list).filter((f) => f.type.startsWith("image/")));
  }

  async function buildPdf() {
    setError(null);
    if (images.length === 0) {
      setError("Add the images you generated (named 01.png, 02.png, …).");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("age", age);
      form.append("gender", gender);
      form.append("bookId", bookId);
      images.forEach((f) => form.append("images", f));

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

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}

      {step === "profile" && (
        <>
          <p className={styles.steps}>
            Step 1 of 2 — tell us about your child, then we&apos;ll give you the
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
          <p className={styles.steps}>Step 2 of 2 — generate, then build.</p>
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
              <button
                className={styles.copyButton}
                onClick={() => copyPrompt(anchorPrompt, 0)}
              >
                {copied === 0 ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className={styles.promptText}>{anchorPrompt}</p>
          </div>

          <p className={styles.steps}>
            Then generate each page — attach <code>00-character.png</code> + a
            photo, set the aspect ratio shown on the card (most are{" "}
            <code>3:2</code>; a few are <code>21:9</code> wide spreads), paste the
            prompt, and save with the filename.
          </p>

          <div className={styles.toolbar}>
            <button className={styles.secondaryButton} onClick={downloadMarkdown}>
              ⬇ Download prompts.md
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => setStep("profile")}
            >
              ← Edit details
            </button>
          </div>

          <div className={styles.promptList}>
            {pages.map((p) => (
              <div key={p.page} className={styles.promptItem}>
                <div className={styles.promptHead}>
                  <span className={styles.promptLabel}>
                    Page {String(p.page).padStart(2, "0")} ·{" "}
                    {p.role ?? p.kind.toUpperCase()} ·{" "}
                    {p.spread ? `${p.aspect} spread` : (p.aspect ?? "3:2")}{" "}
                    <span className={styles.promptFile}>{p.filename}</span>
                  </span>
                  <button
                    className={styles.copyButton}
                    onClick={() => copyPrompt(p.prompt, p.page)}
                  >
                    {copied === p.page ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className={styles.promptText}>{p.prompt}</p>
              </div>
            ))}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Your generated images{" "}
              <span className={styles.hint}>
                ({images.length} selected — named 01.png, 02.png, …)
              </span>
            </label>
            <label className={styles.dropzone}>
              <div style={{ fontSize: 30 }}>🖼️</div>
              <div className={styles.dropzoneText}>Click to choose images</div>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => onImages(e.target.files)}
              />
            </label>
          </div>

          <button className={styles.button} onClick={buildPdf} disabled={busy}>
            {busy ? "Building your PDF…" : "Build my PDF 📖"}
          </button>
        </>
      )}
    </>
  );
}

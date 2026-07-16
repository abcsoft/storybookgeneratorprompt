"use client";

import { useEffect, useRef, useState } from "react";
import ProfileFields, { type Gender } from "./ProfileFields";
import styles from "./page.module.css";

type Phase = "idle" | "generating" | "done" | "error";

interface Progress {
  completed: number;
  total: number;
}

/** Automatic flow: upload photos, generate every illustration via the API. */
export default function AutoFlow({
  bookId,
  pageCount = 24,
}: {
  bookId: string;
  /** Illustrations in the chosen book — drives the progress bar + billing note. */
  pageCount?: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState("4");
  const [gender, setGender] = useState<Gender>("boy");
  const [progress, setProgress] = useState<Progress>({
    completed: 0,
    total: pageCount,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadedRef = useRef(false);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => {
    if (phase !== "generating" || !jobId) return;

    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setProgress({ completed: data.completed, total: data.total });

        if (data.status === "done" && data.pdfReady) {
          setPhase("done");
          if (!downloadedRef.current) {
            downloadedRef.current = true;
            triggerDownload(jobId);
          }
        } else if (data.status === "error") {
          setError(data.error ?? "Something went wrong while generating.");
          setPhase("error");
        }
      } catch {
        /* transient — keep polling */
      }
    };

    void tick();
    pollRef.current = setInterval(tick, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, jobId]);

  function triggerDownload(id: string) {
    const a = document.createElement("a");
    a.href = `/api/jobs/${id}/pdf`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function onFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles(picked.slice(0, 14));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (files.length === 0) {
      setError("Please add at least one photo of your child.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your child's name.");
      return;
    }

    const form = new FormData();
    files.forEach((f) => form.append("photos", f));
    form.append("name", name.trim());
    form.append("age", age);
    form.append("gender", gender);
    form.append("bookId", bookId);

    setPhase("generating");
    setProgress({ completed: 0, total: pageCount });
    downloadedRef.current = false;

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start generation.");
        setPhase("error");
        return;
      }
      setJobId(data.jobId);
      setProgress({ completed: 0, total: data.total ?? pageCount });
    } catch {
      setError("Could not reach the server. Is the dev server running?");
      setPhase("error");
    }
  }

  function reset() {
    setPhase("idle");
    setError(null);
    setJobId(null);
    downloadedRef.current = false;
  }

  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}

      {(phase === "idle" || phase === "error") && (
        <form onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>
              Photos of your child{" "}
              <span className={styles.hint}>
                (1–14 clear photos, faces visible)
              </span>
            </label>
            <label className={styles.dropzone}>
              <div style={{ fontSize: 30 }}>📸</div>
              <div className={styles.dropzoneText}>Click to choose photos</div>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
            {previews.length > 0 && (
              <div className={styles.thumbs}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {previews.map((src, i) => (
                  <img key={i} src={src} alt="" className={styles.thumb} />
                ))}
              </div>
            )}
          </div>

          <ProfileFields
            name={name}
            setName={setName}
            age={age}
            setAge={setAge}
            gender={gender}
            setGender={setGender}
          />

          <button className={styles.button} type="submit">
            Create my storybook ✨
          </button>
          <p className={styles.note}>
            Uses your Gemini API key — billed per illustration ({pageCount} for
            this book).
          </p>
        </form>
      )}

      {phase === "generating" && (
        <div className={styles.progressWrap}>
          <div className={styles.progressLabel}>
            Illustrating page{" "}
            {Math.min(progress.completed + 1, progress.total)} of{" "}
            {progress.total}…
          </div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.note}>
            Each page is drawn by Gemini, so this takes a couple of minutes. Keep
            this tab open.
          </p>
        </div>
      )}

      {phase === "done" && jobId && (
        <div className={styles.progressWrap}>
          <div className={styles.successIcon}>🎉</div>
          <div className={styles.progressLabel}>
            {name}&apos;s storybook is ready!
          </div>
          <a className={styles.linkButton} href={`/api/jobs/${jobId}/pdf`}>
            Download PDF
          </a>
          <button className={styles.restart} onClick={reset}>
            Create another book
          </button>
        </div>
      )}
    </>
  );
}

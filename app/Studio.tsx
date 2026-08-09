"use client";

import { useEffect, useState } from "react";
import type { PrintProfile } from "@/lib/print/types";
import AutoFlow from "./AutoFlow";
import ConfirmDialog from "./ConfirmDialog";
import ManualFlow from "./ManualFlow";
import styles from "./page.module.css";

interface BookMeta {
  id: string;
  title: string;
  subtitle: string;
  /** Illustrations to generate (one per page spec). */
  pages: number;
  /** Physical pages once printed — spreads occupy two leaves. */
  printPages: number;
}

type Mode = "manual" | "auto";

/** Each book's world on the shelf: its cover gradient + drifting motif. New
 *  books without an entry get the fallback, so the shelf never breaks. */
const BOOK_ART: Record<string, { cover: string; motif: string }> = {
  "dream-big": {
    cover: "linear-gradient(150deg, #241b5e 0%, #4a3691 60%, #7b63d1 115%)",
    motif: "🚀",
  },
  "great-adventure": {
    cover: "linear-gradient(150deg, #0d4a42 0%, #1e7f6d 60%, #58e0c6 130%)",
    motif: "🗺️",
  },
  "the-great-detective": {
    cover: "linear-gradient(150deg, #4a2c13 0%, #8a5426 60%, #d99a4e 130%)",
    motif: "🔍",
  },
  "kindness-garden": {
    cover: "linear-gradient(150deg, #234d2c 0%, #4c8f5b 60%, #a9dd8e 130%)",
    motif: "🌱",
  },
  "dinosaur-discovery": {
    cover: "linear-gradient(150deg, #26421c 0%, #55793a 60%, #a8c46b 130%)",
    motif: "🦕",
  },
  "space-explorer": {
    cover: "linear-gradient(150deg, #191138 0%, #3d2a7d 60%, #7a5cd6 130%)",
    motif: "🛸",
  },
  "rainbow-kingdom": {
    cover: "linear-gradient(150deg, #4a2560 0%, #a259c6 60%, #ffb6d9 130%)",
    motif: "🦄",
  },
  "safari-friendship": {
    cover: "linear-gradient(150deg, #5c3d10 0%, #b8862f 60%, #f2cf7e 130%)",
    motif: "🦒",
  },
  "underwater-kingdom": {
    cover: "linear-gradient(150deg, #063049 0%, #0e6e8c 60%, #4fd6c9 130%)",
    motif: "🐬",
  },
  "bedtime-dream": {
    cover: "linear-gradient(150deg, #131a3d 0%, #33417f 60%, #7d8fd6 130%)",
    motif: "✨",
  },
};
const FALLBACK_ART = {
  cover: "linear-gradient(150deg, #2a2060 0%, #4a3691 100%)",
  motif: "📖",
};

/** The interactive card: the book shelf + mode tabs + the active flow. */
export default function Studio({
  books,
  printProfiles,
  defaultProfileId,
}: {
  books: BookMeta[];
  printProfiles: PrintProfile[];
  defaultProfileId: string;
}) {
  const [mode, setMode] = useState<Mode>("manual");
  const [bookId, setBookId] = useState(books[0]?.id ?? "dream-big");
  const [profileId, setProfileId] = useState(defaultProfileId);
  // Whether the manual flow's current session has any imported/generated
  // image — reported up by ManualFlow so switching story can ask first
  // instead of silently carrying old images into a new book.
  const [manualHasWork, setManualHasWork] = useState(false);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);

  // Leaving manual mode drops (unmounts) the whole ManualFlow session, so
  // there's no work left to protect once we're on the Auto tab.
  useEffect(() => {
    if (mode !== "manual") setManualHasWork(false);
  }, [mode]);

  const selected = books.find((b) => b.id === bookId) ?? books[0];
  const selectedProfile =
    printProfiles.find((p) => p.id === profileId) ?? printProfiles[0];

  /** Story change (item 5): if the manual session already has work, confirm
   *  before switching — old images/statuses can't safely carry over into a
   *  different book. ManualFlow reacts to the actual `bookId` prop change by
   *  regenerating its manifest and clearing images once this is confirmed. */
  function requestBookChange(id: string) {
    if (id === bookId) return;
    if (mode === "manual" && manualHasWork) {
      setPendingBookId(id);
    } else {
      setBookId(id);
    }
  }

  return (
    <div className={styles.card}>
      {books.length > 1 && (
        <>
          <div className={styles.shelf} role="group" aria-label="Choose a storybook">
            {books.map((b) => {
              const art = BOOK_ART[b.id] ?? FALLBACK_ART;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`${styles.bookCover} ${bookId === b.id ? styles.bookCoverActive : ""}`}
                  style={{ background: art.cover }}
                  aria-pressed={bookId === b.id}
                  onClick={() => requestBookChange(b.id)}
                >
                  <span className={styles.bookSpine} aria-hidden="true" />
                  <span className={styles.bookMotif} aria-hidden="true">
                    {art.motif}
                  </span>
                  <span className={styles.bookRule} aria-hidden="true" />
                  <span className={styles.bookTitle}>{b.title}</span>
                  <span className={styles.bookPages}>
                    {selectedProfile.interiorPageCount
                      ? `Interior pages: ${selectedProfile.interiorPageCount}`
                      : `${b.printPages} pages`}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={styles.shelfCaption} aria-live="polite">
            {selected?.subtitle}
          </p>
        </>
      )}

      <div className={styles.tabs} role="tablist" aria-label="How to make the images">
        <button
          role="tab"
          aria-selected={mode === "manual"}
          className={`${styles.tab} ${mode === "manual" ? styles.tabActive : ""}`}
          onClick={() => setMode("manual")}
        >
          ✦ I&apos;ll make the images
          <span className={styles.tabHint}>Free · generate in Gemini app</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "auto"}
          className={`${styles.tab} ${mode === "auto" ? styles.tabActive : ""}`}
          onClick={() => setMode("auto")}
        >
          ✨ Auto-generate
          <span className={styles.tabHint}>Uses your API key · billed</span>
        </button>
      </div>

      {mode === "manual" && printProfiles.length > 1 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="print-profile">
            Print profile
          </label>
          <select
            id="print-profile"
            className={styles.select}
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {printProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "manual" ? (
        <ManualFlow
          bookId={bookId}
          profile={selectedProfile ?? printProfiles[0]}
          onSessionWorkChange={setManualHasWork}
        />
      ) : (
        <AutoFlow bookId={bookId} pageCount={selected?.pages ?? 24} />
      )}

      {pendingBookId && (
        <ConfirmDialog
          title="Change story?"
          message="Images and review progress from the current story cannot safely be reused."
          confirmLabel="Change story and clear images"
          danger
          onCancel={() => setPendingBookId(null)}
          onConfirm={() => {
            setBookId(pendingBookId);
            setPendingBookId(null);
          }}
        />
      )}
    </div>
  );
}

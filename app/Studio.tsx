"use client";

import { useState } from "react";
import AutoFlow from "./AutoFlow";
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
};
const FALLBACK_ART = {
  cover: "linear-gradient(150deg, #2a2060 0%, #4a3691 100%)",
  motif: "📖",
};

/** The interactive card: the book shelf + mode tabs + the active flow. */
export default function Studio({ books }: { books: BookMeta[] }) {
  const [mode, setMode] = useState<Mode>("manual");
  const [bookId, setBookId] = useState(books[0]?.id ?? "dream-big");

  const selected = books.find((b) => b.id === bookId) ?? books[0];

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
                  onClick={() => setBookId(b.id)}
                >
                  <span className={styles.bookSpine} aria-hidden="true" />
                  <span className={styles.bookMotif} aria-hidden="true">
                    {art.motif}
                  </span>
                  <span className={styles.bookRule} aria-hidden="true" />
                  <span className={styles.bookTitle}>{b.title}</span>
                  <span className={styles.bookPages}>{b.printPages} pages</span>
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

      {mode === "manual" ? (
        <ManualFlow bookId={bookId} />
      ) : (
        <AutoFlow bookId={bookId} pageCount={selected?.pages ?? 24} />
      )}
    </div>
  );
}

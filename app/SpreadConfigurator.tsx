"use client";

import { useMemo } from "react";
import {
  ELIGIBLE_FACING_PAIRS,
  recalculateAndValidatePhysicalPagePlan,
  type CustomSpreadSelection,
  type LayoutMode,
  type SubjectSide,
  type TextSide,
} from "@/lib/story/layoutPlan";
import styles from "./page.module.css";

interface SpreadConfiguratorProps {
  bookId: string;
  profileId: string;
  mode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
  customSpreads: CustomSpreadSelection[];
  onCustomSpreadsChange: (spreads: CustomSpreadSelection[]) => void;
  childName?: string;
}

/**
 * Live two-page miniature preview for a facing pair.
 * Renders left leaf (verso), right leaf (recto), center gutter, text position, and character position.
 */
function TwoPageMiniPreview({
  startPage,
  endPage,
  isSpread,
  textSide,
  subjectSide,
  childName = "Child",
}: {
  startPage: number;
  endPage: number;
  isSpread: boolean;
  textSide: TextSide;
  subjectSide: SubjectSide;
  childName?: string;
}) {
  return (
    <div className={styles.miniSpreadShell}>
      {/* Left Leaf (Verso) */}
      <div className={`${styles.miniLeaf} ${styles.miniLeafLeft}`}>
        <div className={styles.miniLeafHeader}>
          <span>Page {startPage}</span>
          <span className={styles.miniLeafBadge}>Verso (Left)</span>
        </div>

        {isSpread ? (
          <div className={styles.miniSpreadContent}>
            {textSide === "left" && (
              <div className={styles.miniTextBubble}>
                📝 <strong>Story Text</strong>
                <span>Calm environment</span>
              </div>
            )}
            {subjectSide === "left" && (
              <div className={styles.miniCharBubble}>
                ⭐ <strong>{childName}</strong>
                <span>Facing right →</span>
              </div>
            )}
            {textSide === "none" && subjectSide === "centered" && (
              <div className={styles.miniArtOnly}>Panoramic Background</div>
            )}
          </div>
        ) : (
          <div className={styles.miniSingleContent}>
            <div className={styles.miniSingleArt}>Single Artwork (1:1)</div>
            <div className={styles.miniSingleText}>📝 Page {startPage} Text</div>
          </div>
        )}
      </div>

      {/* Center Gutter Fold */}
      <div className={styles.miniGutter}>
        <span className={styles.miniGutterLine} />
        <span className={styles.miniGutterText}>GUTTER</span>
        <span className={styles.miniGutterLine} />
      </div>

      {/* Right Leaf (Recto) */}
      <div className={`${styles.miniLeaf} ${styles.miniLeafRight}`}>
        <div className={styles.miniLeafHeader}>
          <span className={styles.miniLeafBadge}>Recto (Right)</span>
          <span>Page {endPage}</span>
        </div>

        {isSpread ? (
          <div className={styles.miniSpreadContent}>
            {textSide === "right" && (
              <div className={styles.miniTextBubble}>
                📝 <strong>Story Text</strong>
                <span>Calm environment</span>
              </div>
            )}
            {subjectSide === "right" && (
              <div className={styles.miniCharBubble}>
                ⭐ <strong>{childName}</strong>
                <span>Facing left ←</span>
              </div>
            )}
            {textSide === "none" && subjectSide === "centered" && (
              <div className={styles.miniArtOnly}>Panoramic Background</div>
            )}
          </div>
        ) : (
          <div className={styles.miniSingleContent}>
            <div className={styles.miniSingleArt}>Single Artwork (1:1)</div>
            <div className={styles.miniSingleText}>📝 Page {endPage} Text</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpreadConfigurator({
  bookId,
  profileId,
  mode,
  onModeChange,
  customSpreads,
  onCustomSpreadsChange,
  childName = "Child",
}: SpreadConfiguratorProps) {
  const planCheck = useMemo(
    () => recalculateAndValidatePhysicalPagePlan(bookId, profileId, mode, customSpreads),
    [bookId, profileId, mode, customSpreads],
  );

  const spreadMap = useMemo(() => {
    const map = new Map<number, CustomSpreadSelection>();
    for (const s of customSpreads) {
      map.set(s.startPage, s);
    }
    return map;
  }, [customSpreads]);

  function handleTogglePair(startPage: number, endPage: number, enableSpread: boolean) {
    if (enableSpread) {
      // Default: text left, character auto-opposite (right)
      const nextSpread: CustomSpreadSelection = {
        startPage,
        endPage,
        textSide: "left",
        subjectSide: "right",
      };
      const updated = [...customSpreads.filter((s) => s.startPage !== startPage), nextSpread].sort(
        (a, b) => a.startPage - b.startPage,
      );
      onCustomSpreadsChange(updated);
    } else {
      const updated = customSpreads.filter((s) => s.startPage !== startPage);
      onCustomSpreadsChange(updated);
    }
  }

  function handleUpdateTextSide(startPage: number, endPage: number, textSide: TextSide) {
    const existing = spreadMap.get(startPage);
    const defaultSubject: SubjectSide =
      textSide === "left" ? "right" : textSide === "right" ? "left" : "centered";
    const nextSpread: CustomSpreadSelection = {
      startPage,
      endPage,
      textSide,
      subjectSide: existing?.subjectSide ? existing.subjectSide : defaultSubject,
    };
    const updated = [...customSpreads.filter((s) => s.startPage !== startPage), nextSpread].sort(
      (a, b) => a.startPage - b.startPage,
    );
    onCustomSpreadsChange(updated);
  }

  function handleUpdateSubjectSide(startPage: number, endPage: number, subjectSide: SubjectSide) {
    const existing = spreadMap.get(startPage);
    const nextSpread: CustomSpreadSelection = {
      startPage,
      endPage,
      textSide: existing?.textSide ?? "left",
      subjectSide,
    };
    const updated = [...customSpreads.filter((s) => s.startPage !== startPage), nextSpread].sort(
      (a, b) => a.startPage - b.startPage,
    );
    onCustomSpreadsChange(updated);
  }

  return (
    <div className={styles.layoutConfiguratorCard}>
      <div className={styles.layoutConfigHeader}>
        <div>
          <h3 className={styles.layoutConfigTitle}>Book Page Layout</h3>
          <p className={styles.layoutConfigSubtitle}>
            Choose between standard single pages or customize panoramic spreads across valid facing pairs.
          </p>
        </div>
        <div className={styles.layoutModeBadge}>
          {mode === "standard-single" ? "Single Pages Mode" : "Custom Spreads Mode"}
        </div>
      </div>

      {/* Mode Selector */}
      <div className={styles.layoutModeChoices} role="radiogroup" aria-label="Book layout options">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "standard-single"}
          className={`${styles.layoutModeCard} ${mode === "standard-single" ? styles.layoutModeCardActive : ""}`}
          onClick={() => onModeChange("standard-single")}
        >
          <div className={styles.layoutModeCardTop}>
            <span className={styles.layoutModeCardIcon}>📄</span>
            <span className={styles.layoutModeCardName}>Standard Single Pages</span>
            <span className={styles.layoutModeCardPill}>Default & Recommended</span>
          </div>
          <p className={styles.layoutModeCardDesc}>
            Every page is an individual full-bleed illustration (1:1 square). Clean, classic, and fast to generate.
          </p>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={mode === "custom-spreads"}
          className={`${styles.layoutModeCard} ${mode === "custom-spreads" ? styles.layoutModeCardActive : ""}`}
          onClick={() => onModeChange("custom-spreads")}
        >
          <div className={styles.layoutModeCardTop}>
            <span className={styles.layoutModeCardIcon}>📖</span>
            <span className={styles.layoutModeCardName}>Custom Spreads</span>
            <span className={styles.layoutModeCardPill}>Selectable Pairs</span>
          </div>
          <p className={styles.layoutModeCardDesc}>
            Choose individual facing pairs to render as seamless panoramic wide scenes (2:1 aspect) across two pages.
          </p>
        </button>
      </div>

      {/* Fixed Page Count & Validation Status Banner */}
      <div
        className={`${styles.pagePlanBanner} ${planCheck.valid ? styles.pagePlanBannerValid : styles.pagePlanBannerInvalid}`}
      >
        <div className={styles.pagePlanStats}>
          <span>
            Physical Interior Pages: <strong>{planCheck.physicalPageCount}</strong> / {planCheck.requiredPageCount}
          </span>
          <span className={styles.pagePlanDivider}>•</span>
          <span>
            Spreads: <strong>{planCheck.spreadCount}</strong> ({planCheck.spreadCount * 2} pages)
          </span>
          <span className={styles.pagePlanDivider}>•</span>
          <span>
            Single Pages: <strong>{planCheck.singleCount}</strong>
          </span>
        </div>
        <div className={styles.pagePlanExplanation}>{planCheck.explanation}</div>
      </div>

      {/* Custom Spreads Pair Selector (only active when custom-spreads mode is chosen) */}
      {mode === "custom-spreads" && (
        <div className={styles.spreadPairsSection}>
          <div className={styles.spreadPairsIntro}>
            <h4>Eligible Facing Pairs (24-Page Physical Book)</h4>
            <p>
              Page 1 (Dedication) and Page 24 (Final Page) are standalone single pages. Only facing page pairs (verso
              left → recto right) can physically form a printed spread.
            </p>
          </div>

          <div className={styles.spreadPairsList}>
            {ELIGIBLE_FACING_PAIRS.map(([startPage, endPage]) => {
              const spread = spreadMap.get(startPage);
              const isSpread = Boolean(spread);
              const textSide: TextSide = spread?.textSide ?? "left";
              const subjectSide: SubjectSide =
                spread?.subjectSide ?? (textSide === "left" ? "right" : textSide === "right" ? "left" : "centered");

              return (
                <div
                  key={`${startPage}-${endPage}`}
                  className={`${styles.spreadPairItem} ${isSpread ? styles.spreadPairItemActive : ""}`}
                >
                  <div className={styles.spreadPairMainRow}>
                    <div className={styles.spreadPairLabelBlock}>
                      <span className={styles.spreadPairNumber}>
                        Pages {startPage}–{endPage}
                      </span>
                      <span className={styles.spreadPairLeaves}>
                        Verso {startPage} & Recto {endPage}
                      </span>
                    </div>

                    {/* Format Toggle: Single vs Spread */}
                    <div className={styles.spreadFormatToggle} role="group" aria-label={`Layout for pages ${startPage} and ${endPage}`}>
                      <button
                        type="button"
                        className={`${styles.formatToggleBtn} ${!isSpread ? styles.formatToggleBtnActive : ""}`}
                        onClick={() => handleTogglePair(startPage, endPage, false)}
                      >
                        Single Pages
                      </button>
                      <button
                        type="button"
                        className={`${styles.formatToggleBtn} ${isSpread ? styles.formatToggleBtnActive : ""}`}
                        onClick={() => handleTogglePair(startPage, endPage, true)}
                      >
                        Two-Page Spread
                      </button>
                    </div>
                  </div>

                  {/* Spread Controls & Live Preview */}
                  {isSpread && (
                    <div className={styles.spreadControlsSubpanel}>
                      <div className={styles.spreadControlsGrid}>
                        {/* Text Placement */}
                        <div className={styles.controlGroup}>
                          <label className={styles.controlLabel}>Story Text Side:</label>
                          <div className={styles.controlPills}>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${textSide === "left" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateTextSide(startPage, endPage, "left")}
                            >
                              Text Left (Page {startPage})
                            </button>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${textSide === "right" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateTextSide(startPage, endPage, "right")}
                            >
                              Text Right (Page {endPage})
                            </button>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${textSide === "none" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateTextSide(startPage, endPage, "none")}
                            >
                              No Text (Art Only)
                            </button>
                          </div>
                        </div>

                        {/* Character Placement */}
                        <div className={styles.controlGroup}>
                          <label className={styles.controlLabel}>
                            Character Placement:
                            <span className={styles.controlHint}>
                              (Auto-opposite text, or override)
                            </span>
                          </label>
                          <div className={styles.controlPills}>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${subjectSide === "left" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateSubjectSide(startPage, endPage, "left")}
                            >
                              Left (Page {startPage})
                            </button>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${subjectSide === "right" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateSubjectSide(startPage, endPage, "right")}
                            >
                              Right (Page {endPage})
                            </button>
                            <button
                              type="button"
                              className={`${styles.pillBtn} ${subjectSide === "centered" ? styles.pillBtnActive : ""}`}
                              onClick={() => handleUpdateSubjectSide(startPage, endPage, "centered")}
                            >
                              Centered
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Live Two-Page Miniature Preview */}
                      <TwoPageMiniPreview
                        startPage={startPage}
                        endPage={endPage}
                        isSpread={isSpread}
                        textSide={textSide}
                        subjectSide={subjectSide}
                        childName={childName}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

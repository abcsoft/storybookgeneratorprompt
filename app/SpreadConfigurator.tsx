"use client";

import { useMemo } from "react";
import {
  recalculateAndValidatePhysicalPagePlan,
  resolveLayoutPlan,
  type CustomSpreadSelection,
  type LayoutMode,
  type SubjectSide,
  type TextSide,
} from "@/lib/story/layoutPlan";
import { getStoryEdition } from "@/lib/story/storyEdition";
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
  // Every registered story now resolves through a "standard-24" StoryEdition
  // (see lib/story/storyEdition.ts), and Custom Spreads is disabled for any
  // edition with no explicitly approved facing pairs — none currently have
  // any. resolveLayoutPlan() rejects a custom-spreads request against such a
  // story outright, so this UI must not let the user reach that state: show
  // the truthful reason instead of the interactive spread picker.
  const standardEdition = getStoryEdition(bookId, "standard-24");
  const approvedSpreadPairs = standardEdition?.approvedSpreadPairs ?? [];
  const customSpreadsUnavailable = Boolean(standardEdition) && approvedSpreadPairs.length === 0;

  const planCheck = useMemo(
    () =>
      customSpreadsUnavailable
        ? null
        : recalculateAndValidatePhysicalPagePlan(bookId, profileId, mode, customSpreads),
    [bookId, profileId, mode, customSpreads, customSpreadsUnavailable],
  );

  const spreadMap = useMemo(() => {
    const map = new Map<number, CustomSpreadSelection>();
    for (const s of customSpreads) {
      map.set(s.startPage, s);
    }
    return map;
  }, [customSpreads]);

  // Ground-truth scene role for each currently-selected spread's starting
  // page, from the same planner the API/Markdown/upload-slots use — never a
  // separately-guessed label like "Closing" for whatever scene actually
  // resolves there.
  const roleByStartPage = useMemo(() => {
    const map = new Map<number, string>();
    if (mode !== "custom-spreads" || customSpreads.length === 0) return map;
    try {
      const plan = resolveLayoutPlan({
        child: { name: childName || "Child", age: 4, gender: "neutral" },
        bookId,
        profileId,
        mode: "custom-spreads",
        customSpreads,
      });
      for (const asset of plan.assets) {
        if (asset.assetKind === "spread" && asset.physicalPages.length === 2) {
          map.set(asset.physicalPages[0], asset.role ?? asset.roleSlug ?? "scene");
        }
      }
    } catch {
      // Leave the map empty — the row falls back to a page-number-only label.
    }
    return map;
  }, [mode, bookId, profileId, customSpreads, childName]);

  /** How many total physical PDF pages the book would have if this one pair
   *  were toggled to/from a spread, keeping every other selection as-is. */
  function totalPagesIfToggled(startPage: number, endPage: number, enableSpread: boolean): number {
    const next = enableSpread
      ? [...customSpreads.filter((s) => s.startPage !== startPage), { startPage, endPage, textSide: "left" as const, subjectSide: "right" as const }]
      : customSpreads.filter((s) => s.startPage !== startPage);
    return recalculateAndValidatePhysicalPagePlan(bookId, profileId, "custom-spreads", next).totalPdfLeafCount;
  }

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

  const modeLabel =
    mode === "standard-single"
      ? "Standard Single — Complete Story"
      : mode === "full-spread-24"
        ? "Full Spread 24-Page Edition"
        : "Expanded Hybrid — selected scenes add pages";

  return (
    <div className={styles.layoutConfiguratorCard}>
      <div className={styles.layoutConfigHeader}>
        <div>
          <h3 className={styles.layoutConfigTitle}>Book Page Layout</h3>
          <p className={styles.layoutConfigSubtitle}>
            Choose the complete story as single pages, or expand selected scenes into wide two-page spreads
            (each expanded scene adds one physical page to the book).
          </p>
        </div>
        <div className={styles.layoutModeBadge}>{modeLabel}</div>
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
            <span className={styles.layoutModeCardName}>Standard Single — Complete Story</span>
            <span className={styles.layoutModeCardPill}>Default & Recommended</span>
          </div>
          <p className={styles.layoutModeCardDesc}>
            Every one of the story's scenes is its own single-page illustration: 24 image assets, 24 physical PDF pages.
          </p>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={mode === "custom-spreads"}
          aria-disabled={customSpreadsUnavailable}
          disabled={customSpreadsUnavailable}
          className={`${styles.layoutModeCard} ${mode === "custom-spreads" ? styles.layoutModeCardActive : ""}`}
          onClick={() => !customSpreadsUnavailable && onModeChange("custom-spreads")}
        >
          <div className={styles.layoutModeCardTop}>
            <span className={styles.layoutModeCardIcon}>📖</span>
            <span className={styles.layoutModeCardName}>Expanded Hybrid</span>
            <span className={styles.layoutModeCardPill}>
              {customSpreadsUnavailable ? "Unavailable for this story" : "Selected scenes add pages"}
            </span>
          </div>
          <p className={styles.layoutModeCardDesc}>
            {customSpreadsUnavailable
              ? "Custom spreads require an approved fixed-24 editorial mapping."
              : (
                <>
                  Pick which scenes become wide panoramic spreads. Nothing is dropped or rewritten — every scene is
                  kept, so <strong>each spread you select adds one physical page</strong> beyond the standard 24-page
                  book.
                </>
              )}
          </p>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={mode === "full-spread-24"}
          aria-disabled={customSpreadsUnavailable}
          disabled={customSpreadsUnavailable}
          className={`${styles.layoutModeCard} ${mode === "full-spread-24" ? styles.layoutModeCardActive : ""}`}
          onClick={() => !customSpreadsUnavailable && onModeChange("full-spread-24")}
        >
          <div className={styles.layoutModeCardTop}>
            <span className={styles.layoutModeCardIcon}>🔒</span>
            <span className={styles.layoutModeCardName}>Full Spread 24-Page Edition</span>
            <span className={styles.layoutModeCardPill}>Coming soon — editorial mapping required</span>
          </div>
          <p className={styles.layoutModeCardDesc}>
            {customSpreadsUnavailable
              ? "Custom spreads require an approved fixed-24 editorial mapping."
              : "A fixed 24-physical-page edition with 11 interior spreads (13 image assets total) requires rewriting the story's 22 scenes down to 11 spread beats — an editorial content decision, not a layout setting. Not available until that mapping is written and approved."}
          </p>
        </button>
      </div>

      {customSpreadsUnavailable ? (
        <div className={styles.pagePlanExplanation} data-testid="custom-spreads-unavailable" role="status">
          Custom spreads require an approved fixed-24 editorial mapping. This story always prints as exactly 24
          interior pages (greeting, intro, 20 narrative scenes, closing, video-QR) plus a separate cover — use
          Standard Single.
        </div>
      ) : (
        planCheck && (
          <>
            {/* Validation / Truthful Page-Count Status Banner */}
            <div
              className={`${styles.pagePlanBanner} ${planCheck.valid ? styles.pagePlanBannerValid : styles.pagePlanBannerInvalid}`}
            >
              {!planCheck.unavailable && (
                <div className={styles.pagePlanStats}>
                  <span>
                    Story scenes: <strong>{planCheck.storySceneCount}</strong>
                  </span>
                  <span className={styles.pagePlanDivider}>•</span>
                  <span>
                    Image assets: <strong>{planCheck.imageAssetCount}</strong> ({planCheck.spreadAssetCount} spread
                    {planCheck.spreadAssetCount === 1 ? "" : "s"}, {planCheck.singleAssetCount} single
                    {planCheck.singleAssetCount === 1 ? "" : "s"})
                  </span>
                  <span className={styles.pagePlanDivider}>•</span>
                  <span>
                    Total physical PDF pages: <strong>{planCheck.totalPdfLeafCount}</strong>
                  </span>
                </div>
              )}
              <div className={styles.pagePlanExplanation}>{planCheck.explanation}</div>
              {mode === "custom-spreads" && planCheck.spreadCount > 0 && planCheck.totalPdfLeafCount !== planCheck.storySceneCount + 2 && (
                <div className={styles.pagePlanWarning} role="alert">
                  ⚠️ Each selected spread adds one physical page. Selecting {planCheck.spreadCount} spread
                  {planCheck.spreadCount === 1 ? "" : "s"} produces a {planCheck.totalPdfLeafCount}-page book.
                </div>
              )}
            </div>

            {mode === "full-spread-24" && (
              <div className={styles.pagePlanExplanation} data-testid="full-spread-24-coming-soon">
                Full Spread 24-Page Edition is coming soon — editorial mapping required. Use Standard Single or
                Expanded Hybrid for now.
              </div>
            )}
          </>
        )
      )}

      {/* Expanded Hybrid Scene Spread Selector (only active in that mode) */}
      {!customSpreadsUnavailable && planCheck && mode === "custom-spreads" && (
        <div className={styles.spreadPairsSection}>
          <div className={styles.spreadPairsIntro}>
            <h4>Expanded Hybrid — selectable scene spreads</h4>
            <p>
              Every scene below is kept in the book. Toggling a pair to <strong>Two-Page Spread</strong> renders that
              scene as one wide panoramic image instead of a single page — and adds one physical page to the final
              book, shifting every later scene, Closing, and the Backcover forward by one page. Page 1 (Dedication)
              and the final page are always standalone singles.
            </p>
          </div>

          <div className={styles.spreadPairsList}>
            {planCheck.eligiblePairs.map(({ startPage, endPage }) => {
              const spread = spreadMap.get(startPage);
              const isSpread = Boolean(spread);
              const textSide: TextSide = spread?.textSide ?? "left";
              const subjectSide: SubjectSide =
                spread?.subjectSide ?? (textSide === "left" ? "right" : textSide === "right" ? "left" : "centered");
              const role = roleByStartPage.get(startPage);
              const totalIfToggled = totalPagesIfToggled(startPage, endPage, !isSpread);

              return (
                <div
                  key={`${startPage}-${endPage}`}
                  className={`${styles.spreadPairItem} ${isSpread ? styles.spreadPairItemActive : ""}`}
                >
                  <div className={styles.spreadPairMainRow}>
                    <div className={styles.spreadPairLabelBlock}>
                      <span className={styles.spreadPairNumber}>
                        Pages {startPage}–{endPage}
                        {role ? ` · ${role}` : ""}
                      </span>
                      <span className={styles.spreadPairLeaves}>
                        Verso {startPage} & Recto {endPage}
                      </span>
                      <span className={styles.spreadPairLeaves} data-testid={`pages-if-toggled-${startPage}-${endPage}`}>
                        {isSpread
                          ? `Currently a spread. Switching back to single pages: ${totalIfToggled} total pages.`
                          : `Expanding this pair adds 1 page: ${totalIfToggled} total pages.`}
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

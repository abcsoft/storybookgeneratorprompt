"use client";

import { useMemo, useState, useRef, type CSSProperties, type ReactNode } from "react";
import type { PrintProfile } from "@/lib/print/types";
import {
  computeTransformGeometry,
  computePercentGeometry,
  getLayoutDimensions,
  resolveArtworkRender,
  sanitizeTransform,
  DEFAULT_ARTWORK_TRANSFORM,
  type ArtworkTransform,
} from "@/lib/print/artworkTransform";
import { buildReviewSequence, buildReviewSequenceForEdition } from "@/lib/manual/reviewOrder";
import { getEditionForProfile } from "@/lib/story/editions";
import { computeOverlayGeometry, type OverlayRectPct } from "@/lib/print/overlayGeometry";
import {
  ARTWORK_FRAME_BACKDROP_BLUR_PX,
  ARTWORK_FRAME_BACKDROP_BRIGHTNESS,
  ARTWORK_FRAME_BACKDROP_SCALE,
  ARTWORK_FRAME_CSS,
} from "@/lib/print/artworkFrame";
import { evaluateExportGate } from "@/lib/manual/exportGate";
import { derivePrimaryBadge, STATUS_LABELS } from "@/lib/manual/illustrationStatus";
import type { IllustrationEntry, ManualPage } from "./ManualFlow";
import { statusClassName } from "./statusStyles";
import styles from "./page.module.css";

import { computePageTextGeometry } from "@/lib/print/printifyPageTemplate";
import { computeCoverZonesPct } from "@/lib/print/coverTemplate";
import { getBook } from "@/lib/story/registry";

type OverlayToggle = "canvas" | "finished" | "safe" | "gutter" | "text";

function rectStyle(r: OverlayRectPct): CSSProperties {
  return {
    left: `${r.leftPct}%`,
    top: `${r.topPct}%`,
    width: `${r.widthPct}%`,
    height: `${r.heightPct}%`,
  };
}

/** Renders the exact verse text panel inside the safe zone, matching lib/print/printifyPageTemplate.ts. */
function VersePanelOverlay({
  text,
  ink = "light",
  profile,
  isSpread = false,
}: {
  text: string | null;
  ink?: "light" | "dark";
  profile: PrintProfile;
  isSpread?: boolean;
}) {
  if (!text || !text.trim()) return null;
  const geom = computePageTextGeometry(profile, isSpread);

  const style: CSSProperties = {
    position: "absolute",
    left: `${geom.leftPct}%`,
    bottom: `${geom.bottomPct}%`,
    maxWidth: `${geom.maxWidthPct}%`,
    padding: "3.5% 4.5%",
    borderRadius: "14px",
    fontFamily: '"Nunito", "Trebuchet MS", sans-serif',
    fontWeight: 700,
    fontSize: "clamp(9px, 2.5vw, 22px)",
    lineHeight: 1.32,
    zIndex: 5,
    pointerEvents: "none",
    color: ink === "dark" ? "#231d2b" : "#fff",
    background: ink === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.32)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  };

  return (
    <div style={style}>
      {text.split("\n\n").map((para, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "0.4em 0 0" }}>
          {para}
        </p>
      ))}
    </div>
  );
}

/** Renders the full 5370x2850 wrap cover preview (BACK | SPINE | FRONT) with title lockup. */
function CoverWrapPreview({
  profile,
  title,
  childName,
  frontSrc,
  backSrc,
  frontTransform,
  backTransform,
}: {
  profile: PrintProfile;
  title: string;
  childName: string;
  frontSrc: string | null;
  backSrc: string | null;
  frontTransform?: ArtworkTransform;
  backTransform?: ArtworkTransform;
}) {
  const z = computeCoverZonesPct(profile);

  const spineStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: `${z.spineLeftPct}%`,
    width: `${z.spineWidthPct}%`,
    height: "100%",
    background: "#191147",
    borderLeft: "1px dashed rgba(255,255,255,0.3)",
    borderRight: "1px dashed rgba(255,255,255,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    writingMode: "vertical-rl" as any,
    color: "#ffd36b",
    fontFamily: '"Nunito", sans-serif',
    fontWeight: 800,
    fontSize: "clamp(8px, 1.2vw, 15px)",
    letterSpacing: "0.15em",
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${z.canvasWidth} / ${z.canvasHeight}`,
        background: "#241b5e",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      {/* Back Cover Zone */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${z.backLeftPct}%`,
          width: `${z.backWidthPct}%`,
          height: "100%",
        }}
      >
        {backSrc ? (
          <ArtworkFrame src={backSrc} transform={backTransform} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(165deg, #1f1a4d 0%, #4a3691 55%, #2f9e8f 100%)" }} />
        )}
      </div>

      {/* Spine Zone */}
      <div style={spineStyle}>
        SPINE ({profile.spineWidthPx ?? 120}px)
      </div>

      {/* Front Cover Zone */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${z.frontLeftPct}%`,
          width: `${z.frontWidthPct}%`,
          height: "100%",
        }}
      >
        {frontSrc ? (
          <ArtworkFrame src={frontSrc} transform={frontTransform} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(165deg, #4a2560 0%, #a259c6 60%, #ffb6d9 130%)" }} />
        )}
      </div>

      {/* Cover Title Lockup */}
      <div
        style={{
          position: "absolute",
          left: `${z.titleLeftPct}%`,
          bottom: `${z.titleBottomPct}%`,
          maxWidth: `${z.titleMaxWidthPct}%`,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: "clamp(8px, 1vw, 14px)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#ffd277",
            background: "rgba(0,0,0,0.6)",
            padding: "3px 10px",
            borderRadius: "30px",
            marginBottom: "4px",
          }}
        >
          The {title}
        </div>
        <h1
          style={{
            margin: 0,
            color: "#fff",
            fontFamily: '"Fredoka", "Trebuchet MS", sans-serif',
            fontSize: "clamp(16px, 4vw, 56px)",
            lineHeight: 0.96,
            fontWeight: 700,
            textShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {childName}
        </h1>
      </div>
    </div>
  );
}

/** The exact backdrop+subject composition lib/print/artworkFrame.ts's CSS
 *  describes — the full source is always shown (contain-fit), never
 *  cropped; a blurred cover-fit copy of the SAME image fills any leftover
 *  space. Renders identically to what the real export puts in the file. */
function ArtworkFrame({
  src,
  transform,
  profile,
  layout = "single",
  sourcePx,
}: {
  src: string;
  transform?: ArtworkTransform;
  profile?: PrintProfile;
  layout?: "single" | "spread";
  sourcePx?: { width: number; height: number };
}) {
  const targetW = profile
    ? layout === "spread"
      ? profile.canvasPx.width * 2
      : profile.canvasPx.width
    : layout === "spread"
      ? 2000
      : 1000;
  const targetH = profile ? profile.canvasPx.height : 1000;

  const renderGeo = resolveArtworkRender({
    sourceWidth: sourcePx?.width ?? (layout === "spread" ? 2000 : 1000),
    sourceHeight: sourcePx?.height ?? 1000,
    targetWidth: targetW,
    targetHeight: targetH,
    layout,
    transform,
  });

  return (
    <div className="art-frame">
      {renderGeo.showBackdrop && <img className="art-frame__backdrop" src={src} alt="" />}
      <img
        className="art-frame__subject"
        src={src}
        alt=""
        style={{
          position: "absolute",
          left: `${renderGeo.leftPct}%`,
          top: `${renderGeo.topPct}%`,
          width: `${renderGeo.widthPct}%`,
          height: `${renderGeo.heightPct}%`,
          objectFit: "fill",
        }}
      />
    </div>
  );
}

/** One leaf's final-composition preview. A spread is one wide source image;
 *  its left/right leaf each "windows" into one half of that same wide
 *  artwork frame — the exact split point lib/print/printifyExport.ts's
 *  splitSpread uses (dead center of the composed wide canvas) — instead of
 *  re-cropping the raw source with its own, different logic. */
function LeafArt({
  src,
  side,
  transform,
  profile,
  layout = "single",
}: {
  src: string | null;
  side: "left" | "right" | "full";
  transform?: ArtworkTransform;
  profile?: PrintProfile;
  layout?: "single" | "spread";
}) {
  if (!src) {
    return (
      <div className={styles.reviewLeafEmpty} aria-hidden="true">
        🖼️
      </div>
    );
  }
  if (side === "full") {
    return (
      <div className={styles.reviewLeafArt}>
        <ArtworkFrame src={src} transform={transform} profile={profile} layout={layout} />
      </div>
    );
  }
  const shiftStyle: CSSProperties = { left: side === "left" ? "0%" : "-100%" };
  return (
    <div className={styles.reviewLeafFrame}>
      <div className={styles.reviewLeafArt} style={shiftStyle}>
        <ArtworkFrame src={src} transform={transform} profile={profile} layout="spread" />
      </div>
    </div>
  );
}

import { calculateCornerResize, type CornerHandle } from "@/lib/print/artworkTransform";

function FramingEditorModal({
  manifestIndex,
  illustration,
  manifestPage,
  profile,
  totalCount,
  onSaveTransform,
  onMarkNeedsRegeneration,
  onClearNeedsRegeneration,
  onReplaceImage,
  onNavigate,
  onOpenPreview,
  onClose,
}: {
  manifestIndex: number;
  illustration: IllustrationEntry | undefined;
  manifestPage: ManualPage;
  profile: PrintProfile;
  totalCount: number;
  onSaveTransform: (index: number, transform: ArtworkTransform) => void;
  onMarkNeedsRegeneration: (index: number) => void;
  onClearNeedsRegeneration?: (index: number) => void;
  onReplaceImage?: (index: number, file: File) => void;
  onNavigate: (index: number) => void;
  onOpenPreview: (index: number) => void;
  onClose: () => void;
}) {
  const isSpread = manifestPage.pageLayout ? manifestPage.pageLayout === "spread" : (manifestPage.spread ?? false);
  const initialTransform = sanitizeTransform(illustration?.transform);
  const [transform, setTransform] = useState<ArtworkTransform>(initialTransform);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: isSpread ? 2000 : 1000,
    height: 1000,
  });

  const [guideToggles, setGuideToggles] = useState<Set<"canvas" | "trim" | "gutter" | "text">>(
    new Set(["canvas", "trim", "gutter", "text"]),
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const [cornerDrag, setCornerDrag] = useState<{
    corner: CornerHandle;
    startX: number;
    startY: number;
    initialScale: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  const layoutDims = useMemo(
    () => getLayoutDimensions(profile, isSpread ? "spread" : "single"),
    [profile, isSpread],
  );

  const renderGeo = useMemo(
    () =>
      resolveArtworkRender({
        sourceWidth: naturalSize.width,
        sourceHeight: naturalSize.height,
        targetWidth: layoutDims.width,
        targetHeight: layoutDims.height,
        layout: isSpread ? "spread" : "single",
        transform,
      }),
    [naturalSize, layoutDims, isSpread, transform],
  );

  const pct = renderGeo;
  const canvasAspect = layoutDims.aspectCss;
  const canvasWidthPx = isSpread
    ? 600
    : Math.round(360 * (layoutDims.width / profile.canvasPx.height));

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only drag canvas if not clicking directly on a corner handle
    if ((e.target as HTMLElement).classList.contains(styles.cornerHandle)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      initialX: transform.offsetX,
      initialY: transform.offsetY,
    });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (cornerDrag && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaXPx = (e.clientX - cornerDrag.startX) * (layoutDims.width / rect.width);
      const deltaYPx = (e.clientY - cornerDrag.startY) * (layoutDims.height / rect.height);
      const nextScale = calculateCornerResize(
        cornerDrag.initialScale,
        cornerDrag.initialW,
        cornerDrag.initialH,
        deltaXPx,
        deltaYPx,
        cornerDrag.corner,
      );
      setTransform((cur) => ({
        ...cur,
        mode: "manual",
        scale: nextScale,
      }));
      return;
    }

    if (!isDragging || !dragStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX = (e.clientX - dragStart.x) / rect.width;
    const deltaY = (e.clientY - dragStart.y) / rect.height;

    const nextX = Math.max(-1.5, Math.min(1.5, dragStart.initialX + deltaX));
    const nextY = Math.max(-1.5, Math.min(1.5, dragStart.initialY + deltaY));

    setTransform((cur) => ({
      ...cur,
      mode: "manual",
      offsetX: Number(nextX.toFixed(3)),
      offsetY: Number(nextY.toFixed(3)),
    }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
    if (cornerDrag) {
      setCornerDrag(null);
    }
  }

  function startCornerDrag(e: React.PointerEvent<HTMLDivElement>, corner: CornerHandle) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setCornerDrag({
      corner,
      startX: e.clientX,
      startY: e.clientY,
      initialScale: transform.scale,
      initialW: renderGeo.renderedWidth,
      initialH: renderGeo.renderedHeight,
    });
  }

  function toggleGuide(g: "canvas" | "trim" | "gutter" | "text") {
    setGuideToggles((cur) => {
      const next = new Set(cur);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function handleSave() {
    onSaveTransform(manifestIndex, transform);
    onClose();
  }

  function handleSaveAndNext() {
    onSaveTransform(manifestIndex, transform);
    if (manifestIndex < totalCount - 1) {
      onNavigate(manifestIndex + 1);
    } else {
      onClose();
    }
  }

  const illoNumStr = String(manifestPage.illustrationNumber ?? manifestPage.page).padStart(2, "0");
  const isNeedsRegen = illustration?.status === "needs-regeneration" || illustration?.needsRegeneration;

  return (
    <div className={styles.editorOverlay} role="dialog" aria-modal="true">
      <div className={styles.editorModal}>
        <div className={styles.editorHeader}>
          <h3 className={styles.editorTitle}>
            Adjust Framing — Illustration {illoNumStr} ({manifestPage.filename}) [{isSpread ? "Spread" : "Single Page"}]
          </h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.editorModeBtn} ${styles.editorModeBtnActive}`}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              🖼️ Adjust framing
            </button>
            <button
              type="button"
              className={styles.editorModeBtn}
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={() => {
                onOpenPreview(manifestIndex);
                onClose();
              }}
            >
              👁️ Preview final page
            </button>
            <button type="button" className={styles.editorClose} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className={styles.editorViewportContainer}>
          <div
            ref={canvasRef}
            className={styles.editorCanvas}
            style={{ width: `${canvasWidthPx}px`, aspectRatio: canvasAspect }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {transform.backgroundMode === "extended" && illustration?.objectUrl && (
              <img
                src={illustration.objectUrl}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: `blur(${ARTWORK_FRAME_BACKDROP_BLUR_PX / 2}px) brightness(${ARTWORK_FRAME_BACKDROP_BRIGHTNESS})`,
                  transform: `scale(${ARTWORK_FRAME_BACKDROP_SCALE})`,
                }}
              />
            )}

            {illustration?.objectUrl && (
              <img
                src={illustration.objectUrl}
                alt=""
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                  }
                }}
                style={{
                  position: "absolute",
                  left: `${pct.leftPct}%`,
                  top: `${pct.topPct}%`,
                  width: `${pct.widthPct}%`,
                  height: `${pct.heightPct}%`,
                  objectFit: "fill",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Canva/Lulu Bounding Box & 4 Corner Resize Handles */}
            <div
              className={styles.framingBoundingBox}
              style={{
                left: `${pct.leftPct}%`,
                top: `${pct.topPct}%`,
                width: `${pct.widthPct}%`,
                height: `${pct.heightPct}%`,
              }}
            >
              <div
                className={`${styles.cornerHandle} ${styles.cornerHandleTopLeft}`}
                onPointerDown={(e) => startCornerDrag(e, "top-left")}
              />
              <div
                className={`${styles.cornerHandle} ${styles.cornerHandleTopRight}`}
                onPointerDown={(e) => startCornerDrag(e, "top-right")}
              />
              <div
                className={`${styles.cornerHandle} ${styles.cornerHandleBottomLeft}`}
                onPointerDown={(e) => startCornerDrag(e, "bottom-left")}
              />
              <div
                className={`${styles.cornerHandle} ${styles.cornerHandleBottomRight}`}
                onPointerDown={(e) => startCornerDrag(e, "bottom-right")}
              />
            </div>

            {/* Fixed Print Guides & Overlays */}
            <div className={styles.overlayLayer} style={{ pointerEvents: "none" }}>
              {guideToggles.has("canvas") && (
                <div
                  style={{
                    position: "absolute",
                    inset: "0%",
                    border: "2px solid rgba(59, 130, 246, 0.6)",
                    boxSizing: "border-box",
                  }}
                />
              )}
              {guideToggles.has("trim") && (
                <div
                  style={{
                    position: "absolute",
                    inset: "3.2%",
                    border: "2px solid #58e0c6",
                    boxSizing: "border-box",
                  }}
                />
              )}
              {isSpread ? (
                <>
                  {guideToggles.has("trim") && (
                    <div
                      style={{
                        position: "absolute",
                        left: "5%",
                        top: "6%",
                        width: "42%",
                        height: "88%",
                        border: "2px dashed #ffd36b",
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                  {guideToggles.has("gutter") && (
                    <div
                      style={{
                        position: "absolute",
                        left: "47%",
                        top: "0%",
                        width: "6%",
                        height: "100%",
                        background: "rgba(232, 93, 93, 0.28)",
                        borderLeft: "1px dashed #e85d5d",
                        borderRight: "1px dashed #e85d5d",
                      }}
                    />
                  )}
                  {guideToggles.has("trim") && (
                    <div
                      style={{
                        position: "absolute",
                        left: "53%",
                        top: "6%",
                        width: "42%",
                        height: "88%",
                        border: "2px dashed #ffd36b",
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                </>
              ) : (
                guideToggles.has("trim") && (
                  <div
                    style={{
                      position: "absolute",
                      left: "6%",
                      top: "6%",
                      width: "88%",
                      height: "88%",
                      border: "2px dashed #ffd36b",
                      boxSizing: "border-box",
                    }}
                  />
                )
              )}

              {/* Fixed Story Text Overlay */}
              {guideToggles.has("text") && manifestPage.text && (
                <div
                  style={{
                    position: "absolute",
                    left: isSpread ? "6%" : "8%",
                    bottom: "8%",
                    width: isSpread ? "38%" : "84%",
                    background: "rgba(255, 255, 255, 0.88)",
                    color: "#1c1440",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    boxSizing: "border-box",
                  }}
                >
                  📝 {manifestPage.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Guides Toggle Bar */}
        <div className={styles.editorToolbar}>
          <div className={styles.guideToggleGroup}>
            <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700, marginRight: "4px" }}>
              Guides:
            </span>
            <button
              type="button"
              className={`${styles.guideToggleBtn} ${guideToggles.has("canvas") ? styles.guideToggleBtnActive : ""}`}
              onClick={() => toggleGuide("canvas")}
            >
              Canvas
            </button>
            <button
              type="button"
              className={`${styles.guideToggleBtn} ${guideToggles.has("trim") ? styles.guideToggleBtnActive : ""}`}
              onClick={() => toggleGuide("trim")}
            >
              Trim/Safe
            </button>
            {isSpread && (
              <button
                type="button"
                className={`${styles.guideToggleBtn} ${guideToggles.has("gutter") ? styles.guideToggleBtnActive : ""}`}
                onClick={() => toggleGuide("gutter")}
              >
                Gutter
              </button>
            )}
            {manifestPage.text && (
              <button
                type="button"
                className={`${styles.guideToggleBtn} ${guideToggles.has("text") ? styles.guideToggleBtnActive : ""}`}
                onClick={() => toggleGuide("text")}
              >
                Story Text
              </button>
            )}
          </div>
        </div>

        <div className={styles.editorToolbar}>
          <div className={styles.editorSliderGroup}>
            <label htmlFor="zoom-slider">Zoom:</label>
            <input
              id="zoom-slider"
              type="range"
              min="0.5"
              max="3.0"
              step="0.05"
              value={transform.scale}
              onChange={(e) =>
                setTransform((cur) => ({
                  ...cur,
                  mode: "manual",
                  scale: parseFloat(e.target.value),
                }))
              }
            />
            <span>{Math.round(transform.scale * 100)}%</span>
            <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", marginLeft: "8px" }}>
              X: {transform.offsetX >= 0 ? `+${transform.offsetX.toFixed(2)}` : transform.offsetX.toFixed(2)} | Y: {transform.offsetY >= 0 ? `+${transform.offsetY.toFixed(2)}` : transform.offsetY.toFixed(2)} | Scale: {transform.scale.toFixed(2)}x
            </span>
          </div>

          <div className={styles.editorButtonGroup}>
            <button
              type="button"
              className={`${styles.editorModeBtn} ${transform.mode === "fit" ? styles.editorModeBtnActive : ""}`}
              onClick={() => setTransform((cur) => ({ ...cur, mode: "fit", scale: 1.0, offsetX: 0, offsetY: 0 }))}
            >
              Fit
            </button>
            <button
              type="button"
              className={`${styles.editorModeBtn} ${transform.mode === "fill" ? styles.editorModeBtnActive : ""}`}
              onClick={() => setTransform((cur) => ({ ...cur, mode: "fill", scale: 1.0, offsetX: 0, offsetY: 0 }))}
            >
              Fill
            </button>
            <button
              type="button"
              className={styles.editorModeBtn}
              onClick={() => setTransform(DEFAULT_ARTWORK_TRANSFORM)}
            >
              Reset
            </button>
            <button
              type="button"
              className={styles.editorModeBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Replace image 🔄
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onReplaceImage) {
                  onReplaceImage(manifestIndex, file);
                  setTransform(DEFAULT_ARTWORK_TRANSFORM);
                }
                e.target.value = "";
              }}
            />
          </div>

          <label className={styles.issueOption} style={{ fontSize: "14px", color: "#fff" }}>
            <input
              type="checkbox"
              checked={transform.backgroundMode === "extended"}
              onChange={(e) =>
                setTransform((cur) => ({
                  ...cur,
                  backgroundMode: e.target.checked ? "extended" : "none",
                }))
              }
            />
            Extend background
          </label>
        </div>

        <div className={styles.editorToolbar} style={{ background: isNeedsRegen ? "rgba(232, 93, 93, 0.25)" : "rgba(232, 93, 93, 0.12)", border: "1px solid rgba(232, 93, 93, 0.4)" }}>
          <span style={{ color: "#ffd277", fontSize: "13px" }}>
            {isNeedsRegen ? "⚠️ Marked for regeneration." : "Important content is already outside the source artwork?"}
          </span>
          {isNeedsRegen ? (
            <button
              type="button"
              className={styles.editorModeBtn}
              style={{ borderColor: "#ffd277", color: "#ffd277" }}
              onClick={() => {
                onClearNeedsRegeneration?.(manifestIndex);
              }}
            >
              Undo regeneration request ✕
            </button>
          ) : (
            <button
              type="button"
              className={styles.editorModeBtn}
              style={{ borderColor: "#e85d5d", color: "#e85d5d" }}
              onClick={() => {
                onMarkNeedsRegeneration(manifestIndex);
                onClose();
              }}
            >
              Mark needs regeneration 🔄
            </button>
          )}
        </div>

        <div className={styles.editorFooter}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={manifestIndex === 0}
              onClick={() => onNavigate(manifestIndex - 1)}
            >
              ← Previous
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={manifestIndex >= totalCount - 1}
              onClick={() => onNavigate(manifestIndex + 1)}
            >
              Next →
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.button} style={{ padding: "10px 20px" }} onClick={handleSave}>
              Save
            </button>
            <button type="button" className={styles.button} style={{ padding: "10px 20px" }} onClick={handleSaveAndNext}>
              Save & Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Step 3 — the pre-build book review (item 5) + print-geometry overlay
 *  (item 6) + the approval/export gate (item 7). Physical page numbering
 *  comes from lib/manual/reviewOrder.ts; overlay rectangles come from
 *  lib/print/overlayGeometry.ts — both driven entirely by `profile`, nothing
 *  hardcoded here. */
export default function BookReview({
  manifest,
  illustrations,
  profile,
  bookId,
  childName = "Alex",
  strictMode,
  onToggleStrict,
  onBack,
  busy,
  exportLabel,
  onExport,
  onUpdateTransform,
  onApprovePage,
  onMarkNeedsRegeneration,
  onClearNeedsRegeneration,
  onReplaceImage,
  resultPanel,
}: {
  manifest: ManualPage[];
  illustrations: Record<number, IllustrationEntry>;
  profile: PrintProfile;
  bookId?: string;
  childName?: string;
  strictMode: boolean;
  onToggleStrict: (v: boolean) => void;
  onBack: () => void;
  busy: boolean;
  exportLabel: string;
  onExport: () => void;
  onUpdateTransform?: (manifestIndex: number, transform: ArtworkTransform) => void;
  onApprovePage?: (manifestIndex: number) => void;
  onMarkNeedsRegeneration?: (manifestIndex: number) => void;
  onClearNeedsRegeneration?: (manifestIndex: number) => void;
  onReplaceImage?: (manifestIndex: number, file: File) => void;
  resultPanel?: ReactNode;
}) {
  const edition = bookId ? getEditionForProfile(bookId, profile) : null;
  const entries = useMemo(
    () => (edition ? buildReviewSequenceForEdition(edition) : buildReviewSequence(manifest)),
    [edition, manifest],
  );
  const statuses = manifest.map((_, i) => illustrations[i]?.status ?? "missing");
  const gate = evaluateExportGate(statuses, { strict: strictMode });

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [framingEditorIndex, setFramingEditorIndex] = useState<number | null>(null);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [overlays, setOverlays] = useState<Set<OverlayToggle>>(new Set(["text"]));

  const bookTitle = bookId ? getBook(bookId).title : "Story";
  const coverEntry = illustrations[0];
  const backCoverEntry = illustrations[manifest.length - 1];

  const openEntry = openIndex !== null ? (entries.find((e) => e.manifestIndex === openIndex) ?? null) : null;
  const openManifestPage = openIndex !== null ? (manifest.find((m) => m.index === openIndex) ?? null) : null;
  const openImage = openIndex !== null ? (illustrations[openIndex]?.objectUrl ?? null) : null;
  const openTransform = openIndex !== null ? illustrations[openIndex]?.transform : undefined;
  const openIsSpread = openManifestPage
    ? (openManifestPage.pageLayout ? openManifestPage.pageLayout === "spread" : (openManifestPage.spread ?? false))
    : openEntry?.layout === "spread";
  const openGeo = openEntry ? computeOverlayGeometry(profile, openIsSpread) : null;
  const openAspect = openEntry
    ? openIsSpread
      ? `${profile.canvasPx.width * 2} / ${profile.canvasPx.height}`
      : `${profile.canvasPx.width} / ${profile.canvasPx.height}`
    : undefined;

  const textGeom = useMemo(() => computePageTextGeometry(profile), [profile]);

  const totalIllustrations = manifest.length;
  const approvedCount = manifest.filter(
    (m) => illustrations[m.index]?.status === "approved" && !illustrations[m.index]?.needsRegeneration,
  ).length;
  const regenCount = manifest.filter(
    (m) => illustrations[m.index]?.status === "needs-regeneration" || illustrations[m.index]?.needsRegeneration,
  ).length;
  const needReviewCount = Math.max(0, totalIllustrations - approvedCount - regenCount);

  const unresolvedIndices = manifest
    .filter((m) => {
      const entry = illustrations[m.index];
      return !entry || entry.status !== "approved" || entry.needsRegeneration;
    })
    .map((m) => m.index);

  function toggleOverlay(o: OverlayToggle) {
    setOverlays((cur) => {
      const next = new Set(cur);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  }

  return (
    <>
      <style>{ARTWORK_FRAME_CSS}</style>

      <p className={styles.steps}>
        Step 3 of 3 — flip through the finished book in order, then export.
        Each tile below shows the exact final composition — click &quot;Adjust framing&quot; to fine-tune zoom and position.
      </p>

      <div className={styles.reviewGrid}>
        {/* Cover Review Tile */}
        {profile.coverGeometryPx && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "1 / -1", marginBottom: "8px" }}>
            <div
              className={styles.reviewTile}
              onClick={() => setShowCoverModal(true)}
              style={{ cursor: "pointer" }}
            >
              <CoverWrapPreview
                profile={profile}
                title={bookTitle}
                childName={childName}
                frontSrc={coverEntry?.objectUrl ?? null}
                backSrc={backCoverEntry?.objectUrl ?? null}
                frontTransform={coverEntry?.transform}
                backTransform={backCoverEntry?.transform}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                <span className={styles.reviewTileLabel} style={{ fontSize: "12px", fontWeight: 700 }}>
                  📖 Full Wrap Cover (Back | Spine | Front)
                </span>
                <span className={`${styles.statusBadge} ${styles.statusApproved}`}>
                  Cover Wrap Reviewed
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className={styles.editorModeBtn}
                style={{ flex: 1, fontSize: "12px", padding: "6px 8px" }}
                onClick={() => setShowCoverModal(true)}
              >
                👁️ Preview Cover Wrap
              </button>
              <button
                type="button"
                className={styles.editorModeBtn}
                style={{ flex: 1, fontSize: "12px", padding: "6px 8px", borderColor: "var(--star)", color: "#fff" }}
                onClick={() => setFramingEditorIndex(0)}
              >
                🖼️ Adjust cover framing
              </button>
            </div>
          </div>
        )}

        {/* Interior Page Tiles */}
        {entries.map((e) => {
          const entry = illustrations[e.manifestIndex];
          const status = entry?.status ?? "missing";
          const label = e.layout === "spread" ? `Pages ${e.startPage}–${e.endPage}` : `Page ${e.page}`;
          const manifestPage = manifest.find((m) => m.index === e.manifestIndex);
          const isSpread = manifestPage
            ? (manifestPage.pageLayout ? manifestPage.pageLayout === "spread" : (manifestPage.spread ?? false))
            : e.layout === "spread";
          const hasCustomTransform =
            entry?.transform &&
            (entry.transform.scale !== 1.0 || entry.transform.offsetX !== 0 || entry.transform.offsetY !== 0);

          const primaryBadge = derivePrimaryBadge({
            status,
            needsRegeneration: entry?.needsRegeneration || status === "needs-regeneration",
            hasCustomTransform: !!hasCustomTransform,
          });

          const tileAspect = isSpread
            ? `${profile.canvasPx.width * 2} / ${profile.canvasPx.height}`
            : `${profile.canvasPx.width} / ${profile.canvasPx.height}`;

          return (
            <div key={e.manifestIndex} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                className={styles.reviewTile}
                onClick={() => setFramingEditorIndex(e.manifestIndex)}
                style={{ cursor: "pointer" }}
              >
                <div className={styles.reviewArt} style={{ aspectRatio: tileAspect, position: "relative" }}>
                  {isSpread ? (
                    <>
                      <LeafArt src={entry?.objectUrl ?? null} side="left" transform={entry?.transform} profile={profile} layout="spread" />
                      <LeafArt src={entry?.objectUrl ?? null} side="right" transform={entry?.transform} profile={profile} layout="spread" />
                    </>
                  ) : (
                    <LeafArt src={entry?.objectUrl ?? null} side="full" transform={entry?.transform} profile={profile} layout="single" />
                  )}
                  <VersePanelOverlay text={manifestPage?.text ?? null} profile={profile} isSpread={isSpread} />
                </div>
                <span className={styles.reviewTileLabel}>{label}</span>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                  <span
                    className={`${styles.statusBadge} ${
                      primaryBadge.kind === "adjusted" ? styles.statusAdjusted : statusClassName(status)
                    }`}
                  >
                    {primaryBadge.label}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                <button
                  type="button"
                  className={styles.editorModeBtn}
                  style={{ flex: 1, fontSize: "12px", padding: "6px 8px" }}
                  onClick={() => setOpenIndex(e.manifestIndex)}
                >
                  👁️ Preview
                </button>
                <button
                  type="button"
                  className={styles.editorModeBtn}
                  style={{ flex: 1, fontSize: "12px", padding: "6px 8px", borderColor: "var(--star)", color: "#fff", background: "rgba(245, 183, 60, 0.15)" }}
                  onClick={() => setFramingEditorIndex(e.manifestIndex)}
                >
                  🖼️ Adjust framing
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          background: "var(--surface-2)",
          padding: "16px 20px",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          margin: "16px 0",
        }}
      >
        <div>
          <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
            Production Review Summary ({totalIllustrations} illustrations total)
          </h4>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px" }}>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>✓ {approvedCount} approved</span>
            <span style={{ color: "#3b82f6", fontWeight: 700 }}>👁️ {needReviewCount} need review</span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠️ {regenCount} need regeneration</span>
          </div>
        </div>

        {unresolvedIndices.length > 0 && (
          <button
            type="button"
            className={styles.button}
            style={{ padding: "8px 14px", fontSize: "13px", background: "var(--star)", color: "#1c1440" }}
            onClick={() => setFramingEditorIndex(unresolvedIndices[0])}
          >
            Review unresolved pages ({unresolvedIndices.length}) 🔍
          </button>
        )}
      </div>

      {gate.blocked ? (
        <div className={styles.error}>
          <strong>Export blocked:</strong>
          <ul>
            {gate.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        gate.warning && <div className={styles.illoWarning}>{gate.warning}</div>
      )}

      <label className={styles.issueOption}>
        <input
          type="checkbox"
          checked={strictMode}
          onChange={(e) => onToggleStrict(e.target.checked)}
        />
        Strict mode — require every illustration to be approved before export
      </label>

      <div className={styles.toolbar}>
        <button className={styles.secondaryButton} onClick={onBack}>
          ← Back to illustrations
        </button>
      </div>

      <button className={styles.button} onClick={onExport} disabled={busy || gate.blocked}>
        {busy ? "Working…" : exportLabel}
      </button>

      {resultPanel}

      {/* Cover Review Modal */}
      {showCoverModal && profile.coverGeometryPx && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCoverModal(false)}
        >
          <div className={styles.modalCard} style={{ maxWidth: "880px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <strong>Cover Wrap Preview ({profile.coverGeometryPx.width} × {profile.coverGeometryPx.height})</strong>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button
                  type="button"
                  className={styles.editorModeBtn}
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                  onClick={() => {
                    setShowCoverModal(false);
                    setFramingEditorIndex(0);
                  }}
                >
                  🖼️ Adjust cover framing
                </button>
                <button className={styles.linkAction} onClick={() => setShowCoverModal(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className={styles.spineWarningNotice}>
              ⚠️ <strong>Spine geometry still requires confirmation</strong> against the current Printify template before production.
            </div>

            <CoverWrapPreview
              profile={profile}
              title={bookTitle}
              childName={childName}
              frontSrc={coverEntry?.objectUrl ?? null}
              backSrc={backCoverEntry?.objectUrl ?? null}
              frontTransform={coverEntry?.transform}
              backTransform={backCoverEntry?.transform}
            />

            <p className={styles.hint} style={{ marginTop: "10px" }}>
              Full wrap cover composition: Back Cover (left) | Spine (center) | Front Cover (right).
            </p>
          </div>
        </div>
      )}

      {/* Page Detail Modal (Read-Only Preview) */}
      {openEntry && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIndex(null)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <strong>
                {openEntry.layout === "spread"
                  ? `Pages ${openEntry.startPage}–${openEntry.endPage}`
                  : `Page ${openEntry.page}`}
              </strong>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button className={styles.linkAction} onClick={() => setOpenIndex(null)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", margin: "10px 0" }}>
              <button
                type="button"
                className={`${styles.editorModeBtn} ${styles.editorModeBtnActive}`}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                👁️ Preview final page
              </button>
              <button
                type="button"
                className={styles.editorModeBtn}
                style={{ fontSize: "12px", padding: "6px 12px", borderColor: "var(--star)", color: "#fff" }}
                onClick={() => {
                  if (openIndex !== null) {
                    setFramingEditorIndex(openIndex);
                    setOpenIndex(null);
                  }
                }}
              >
                🖼️ Adjust framing (Interactive Editor)
              </button>
            </div>

            <p className={styles.hint}>
              Final composition preview — the exact framing and text positioning that will be exported.
            </p>

            <div className={styles.overlayToggleRow}>
              {(["canvas", "finished", "safe", "gutter", "text"] as OverlayToggle[]).map(
                (o) =>
                  (o !== "gutter" || openIsSpread) && (
                    <label key={o} className={styles.issueOption}>
                      <input
                        type="checkbox"
                        checked={overlays.has(o)}
                        onChange={() => toggleOverlay(o)}
                      />
                      {o === "text" ? "Text Area" : o[0].toUpperCase() + o.slice(1)}
                    </label>
                  ),
              )}
            </div>

            <div className={styles.reviewPreviewWrap} style={{ aspectRatio: openAspect, position: "relative" }}>
              <div className={styles.reviewPreviewArt}>
                {openIsSpread ? (
                  <>
                    <div className={styles.reviewPreviewLeaf}>
                      <LeafArt src={openImage} side="left" transform={openTransform} profile={profile} layout="spread" />
                    </div>
                    <div className={styles.reviewPreviewLeaf}>
                      <LeafArt src={openImage} side="right" transform={openTransform} profile={profile} layout="spread" />
                    </div>
                  </>
                ) : (
                  <div className={styles.reviewPreviewLeaf}>
                    <LeafArt src={openImage} side="full" transform={openTransform} profile={profile} layout="single" />
                  </div>
                )}
              </div>

              <VersePanelOverlay text={openManifestPage?.text ?? null} profile={profile} isSpread={openIsSpread} />

              {openGeo && (
                <div className={styles.overlayLayer} aria-hidden="true">
                  {overlays.has("canvas") && (
                    <div
                      className={styles.overlayCanvas}
                      style={{ left: "0%", top: "0%", width: "100%", height: "100%" }}
                    />
                  )}
                  {overlays.has("finished") &&
                    openGeo.leaves.map((leaf, i) => (
                      <div key={`f${i}`} className={styles.overlayFinished} style={rectStyle(leaf.finished)} />
                    ))}
                  {overlays.has("safe") &&
                    openGeo.leaves.map((leaf, i) => (
                      <div key={`s${i}`} className={styles.overlaySafe} style={rectStyle(leaf.safe)} />
                    ))}
                  {overlays.has("gutter") && openGeo.gutter && (
                    <div className={styles.overlayGutter} style={rectStyle(openGeo.gutter)} />
                  )}
                  {overlays.has("text") && (
                    <div
                      className={styles.overlayText}
                      style={{
                        left: `${textGeom.leftPct}%`,
                        bottom: `${textGeom.bottomPct}%`,
                        width: `${textGeom.maxWidthPct}%`,
                        height: "22%",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <p className={styles.hint}>
              Overlay is for review only — it never appears in the exported files.
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                {openIndex !== null && illustrations[openIndex]?.status === "approved" ? (
                  <span className={`${styles.statusBadge} ${styles.statusApproved}`} style={{ padding: "8px 14px", fontSize: "13px" }}>
                    ✓ Approved
                  </span>
                ) : (
                  openIndex !== null && (
                    <button
                      type="button"
                      className={styles.button}
                      style={{ padding: "8px 16px", background: "var(--star)", color: "#1c1440", fontWeight: 700 }}
                      onClick={() => {
                        onApprovePage?.(openIndex);
                      }}
                    >
                      ✓ Approve Illustration
                    </button>
                  )
                )}
                {unresolvedIndices.length > 0 && openIndex !== null && (
                  <button
                    type="button"
                    className={styles.button}
                    style={{ padding: "8px 16px" }}
                    onClick={() => {
                      if (illustrations[openIndex]?.status !== "approved") {
                        onApprovePage?.(openIndex);
                      }
                      const nextUnresolved = unresolvedIndices.find((idx) => idx !== openIndex);
                      if (nextUnresolved !== undefined) {
                        setOpenIndex(nextUnresolved);
                      } else {
                        setOpenIndex(null);
                      }
                    }}
                  >
                    ✓ Approve & Next Unresolved →
                  </button>
                )}
              </div>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setOpenIndex(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {framingEditorIndex !== null && (
        <FramingEditorModal
          manifestIndex={framingEditorIndex}
          illustration={illustrations[framingEditorIndex]}
          manifestPage={manifest.find((m) => m.index === framingEditorIndex) ?? manifest[0]}
          profile={profile}
          totalCount={manifest.length}
          onSaveTransform={(index, t) => {
            onUpdateTransform?.(index, t);
          }}
          onMarkNeedsRegeneration={(index) => {
            onMarkNeedsRegeneration?.(index);
          }}
          onClearNeedsRegeneration={(index) => {
            onClearNeedsRegeneration?.(index);
          }}
          onReplaceImage={(index, file) => {
            onReplaceImage?.(index, file);
          }}
          onNavigate={(nextIndex) => {
            setFramingEditorIndex(nextIndex);
          }}
          onOpenPreview={(idx) => {
            setOpenIndex(idx);
          }}
          onClose={() => setFramingEditorIndex(null)}
        />
      )}
    </>
  );
}

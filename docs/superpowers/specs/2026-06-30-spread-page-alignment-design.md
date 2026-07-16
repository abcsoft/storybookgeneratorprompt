# Spread Page Alignment (Imposition Guard) — Design

**Date:** 2026-06-30
**Scope:** dream-big book only (book 3). `greatAdventure` and `the-great-detective` are deliberately deferred.

## Problem

A two-page spread is one wide illustration split across two leaves. It only reads
correctly when its **left half lands on a left-hand (verso) page and its right half
on the facing right-hand (recto) page** — i.e. the two halves are seen side by side
when the book is open.

Today there is **no imposition logic**: `buildBook`/`page-template` render pages in
order and a spread simply emits two consecutive print pages. Whether a spread ends up
as a facing pair is accidental, decided by how many single pages happen to precede it.

In dream-big (cover = page 1):

| Spread | Lands on | Faces correctly? |
|---|---|---|
| Intro | 2–3 | ✅ even start |
| Astronaut | 5–6 | ❌ odd start → split across the page-turn |
| Closing | 25–26 | ❌ odd start → split |

The astronaut spread is the one observed cut/split in the printed sample.

## Binding model (confirmed)

Single combined file, **cover = page 1** (a recto). Opening the cover reveals PDF
pages 2 and 3 facing each other. Therefore facing pairs are (2,3), (4,5), (6,7)… and
**every spread must begin on an even page**.

## Decisions

1. **Fail fast, never pad.** When a spread would start on an odd page, the generator
   **throws a descriptive error**. We do **not** insert blank/filler pages.
2. **Fix dream-big only now.** `greatAdventure` and `the-great-detective` also use
   spreads and will throw the new error until aligned; that alignment is a later pass.
3. **Keep all three dream-big spreads** (intro, astronaut, closing) and **add a second
   career spread** so the page count aligns and the closing lands even.

## Design

### Component A — imposition validator (`lib/pdf/imposition.ts`, new)

Pure module, no Gemini/PDF/Puppeteer dependency.

- `computeSpreadStarts(pages)` — walk the ordered pages, assign each a 1-based print
  position (cover = page 1; a spread occupies 2 positions, a single 1), and return the
  start page of every spread (with its index/kind for messaging).
- `assertSpreadsAligned(pages)` — for each spread, verify `startPage % 2 === 0`. On the
  first violation, throw an `Error` naming the offending spread (index, `kind`, the odd
  start page) and the remedy, e.g.:
  > `Spread at page index 3 ("scene", astronaut) starts on print page 5, a right-hand page, so its two halves won't face each other. Spreads must begin on an even page — adjust the page sequence by one single page before it.`
- Accepts the minimal structural shape `ReadonlyArray<{ kind: PageKind; spread?: boolean }>`
  so it validates both `BuiltPage[]` (pre-generation) and `GeneratedPage[]`.

### Wire-in (two points)

- `registry.buildPages()` — call `assertSpreadsAligned(builtPages)` before returning, so
  the error surfaces the instant a book is assembled, **before any Gemini image cost**.
- `buildBook()` — assert again at the top before rendering (cheap, pure, defensive).

### Component B — dream-big alignment (`lib/story/dreamBigTemplate.ts`)

Reorder/retag the `ROLES` array so all four spreads start even:

1. Move **Racer** before **Astronaut** (2 singles — Pilot, Racer — precede the astronaut
   spread → it starts on page 6). This is the requested "page 7 → page 5" move.
2. Promote **Deep-sea diver** to a spread (`spread: true`) and place it **before Vet**, so
   it starts on page 22 (even).

Resulting career order: Pilot, Racer, **Astronaut (spread)**, Doctor, Firefighter,
Scientist, Army Officer, Soccer Star, Karate Champion, Detective, Magician, Chef,
Rockstar, Artist, Teacher, Explorer, Photographer, **Deep-sea Diver (spread)**, Vet,
Inventor. (20 roles intact: 18 single + 2 spread.)

Final pagination: spreads at **2–3, 6–7, 22–23, 26–27**; **28 pages total** (even).

> The choice of Deep-sea Diver as the second spread is a recommendation (wide underwater
> vista, pairs with the astronaut's space spread). It can be swapped for any other scene
> at review, as long as the validator still passes.

### Tests

- `lib/pdf/imposition.test.ts`:
  - aligned sequence passes;
  - astronaut-odd case throws and names page 5;
  - closing-odd case throws;
  - cover-only / no-spreads passes;
  - a spread starting on page 1 (odd) throws.
- `lib/story/dreamBigTemplate.test.ts` (or `registry.test.ts`): `buildPages("dream-big")`
  passes `assertSpreadsAligned` and yields spread start pages `[2, 6, 22, 26]`.

## Out of scope / gated follow-ups

- **Image regeneration.** Alignment fixes the *split-across-the-page-turn* problem only.
  The existing astronaut spread image has the face near the image center (the gutter), and
  the newly-promoted deep-sea spread has no 21:9 image yet. Making these look right needs
  regeneration with the existing `SPREAD_NOTE` (face entirely in the right half, clear of
  the fold). **Per standing rule, no image regeneration until the user confirms** — code
  changes land first.
- **greatAdventure / the-great-detective alignment** — deferred; they will throw the new
  error when built.

## Edge cases / notes

- Cover and back cover are always singles (never spreads).
- The validator enforces only **spread-start parity**, not total-page-count divisibility
  (multiple-of-4 for saddle-stitch). The dream-big result (28) already satisfies both, but
  binding-sheet constraints are not in scope.

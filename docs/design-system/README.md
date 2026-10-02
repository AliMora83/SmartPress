# SmartPress

Fast, private compression for images and PDFs. Everything runs on your machine; nothing leaves it.

SmartPress is a precise utility, not a character. The interface stays out of the way so the numbers can speak: what went in, what came out, how much was saved. It ships **dark only**, on the web and as the desktop app, from one codebase.

## Voice and copy

- Plain, short, honest. Say what happened: "Skipped — couldn't reach this preset's minimum quality (15 < 40). Original kept."
- **Never write "upload".** Files are added, dropped or opened; they are never sent anywhere. Use "Drop files or a folder", "Add files".
- Don't overpromise. PNG savings are modest; point people to WebP rather than claiming big PNG gains.
- Savings use a true minus and no space: `−83%`. Sizes use two decimals in MB, none in KB: `2.40 MB`, `412 KB`.
- Presets are named **Min**, **Medium**, **Max** (compression strength). Medium is the default.
- Output files are prefixed `smartpress_` (e.g. `smartpress_P1.png`).

## Visual foundations

- **Colour.** Three stacked neutrals carry the whole layout: `bg-ground` (window), `bg-surface` (rows, panel), `bg-raised` (secondary controls). `accent` (signal blue `#4C8DFF`) is spent only on what matters: the Start button, the selected preset, savings figures, progress fills and focus rings. If more than one accent-filled element is competing on screen, one of them is wrong.
- **Status.** Done = savings figure in `accent`. Skipped = label in `warn` plus a one-line reason in `text-muted`. Processing = percentage in `text-muted` plus an `accent` progress bar. Queued = whole row in `text-muted`, no fill. Never red: nothing in a normal run is an error.
- **Lines.** `line` hairlines divide regions and outline rows. Anything you click gets `control-border` or a fill, so it reads as a control (3:1).
- **Type.** Geist for the interface; Geist Mono for every number and every section label. Numbers are right-aligned in their columns. Labels are uppercase mono at 11px with `0.06em` tracking.
- **Shape.** Radii step up with size: `radius-xs` badges → `radius-xl` drop zone. No shadows; depth comes from the neutral steps.
- **Space.** 4px base. Window padding `space-6`, panel padding `space-5`, row gap `space-2`.

## Layout

A medium-sized window (about 1120 × 740, never full-screen by default):

- **Header:** the wordmark and version tag on the left, with Clear list and Add files on the right.
- **Main column:** the drop strip, which accepts files and folders, then the column headers (File, Original, Result, Saved) and the file rows.
- **Settings panel (320px):** contains Compression presets, PNG mode, Keep PDF text selectable, and Save to (Same as source / Choose folder + path). The Start button is pinned to the bottom.
- **Status bar:** batch totals in mono on the left. A single **Show in folder** button appears once a batch finishes. There are no per-file folder icons and no "Add folder" button.

## Wordmark

Lowercase **smart**press in Geist at `wordmark` size. "smart" is set at 400 in `text-muted` and "press" at 700 in `text`. Beside it sits the mark: a rounded square with two inward chevrons, drawn as a 2px `accent` stroke (`docs/design-system/smartpress-mark.svg`). The old mascot is retired.

## Iconography

Inline stroke icons only, 1.5–1.6px at 14–18px, round caps and joins, `currentColor`. No filled icon sets and no emoji.

## Components

- Button
- PresetSelector
- FileRow (done, nudge, skipped, processing, queued)
- Wordmark

# Vendored pdfjs-dist assets

Served from `/pdfjs/` at runtime by `lib/codecs/pdfFlatten.ts` (Level 3 PDF
flatten, opt-in via `keepTextSelectable: false`). Nothing here is fetched from
a CDN -- same rule as `public/wasm/`, see its `PROVENANCE.md` for why: the
codec worker ships as a `blob:` URL in a Turbopack production build, so every
asset it reaches for has to resolve to an absolute same-origin URL
(`resolveAssetUrl()` in `lib/codecs/loader.ts`), not a path relative to the
package that would otherwise resolve it.

Licence: `pdfjs-dist` is Apache-2.0 (Mozilla). See the repo-root `NOTICE`.

All three are unmodified copies out of the installed `pdfjs-dist` npm package
-- nothing here is hand-edited.

| Path | Source (`pdfjs-dist@6.3.289`) | Files | Bytes |
|---|---|---|---|
| `pdf.worker.min.mjs` | `legacy/build/pdf.worker.min.mjs` | 1 | 1,317,034 |
| `standard_fonts/` | `standard_fonts/` | 16 | 835,584 |
| `cmaps/` | `cmaps/` | 169 | 1,695,744 |

`pdf.worker.min.mjs` SHA-256: `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e`

`standard_fonts/` and `cmaps/` are each ~16-169 small per-glyph-set/per-encoding
files (Foxit substitute fonts and Adobe CMap tables), so they're verified as a
set rather than file-by-file: `diff -rq` against the installed package should
report no differences.

## Why `standard_fonts/` and `cmaps/` are here at all

`flattenPdf()` calls `getDocument()` with `disableFontFace: true`, which makes
pdfjs draw every glyph as a filled canvas path instead of registering an
`@font-face`/`FontFace` with `document.fonts` -- the latter needs a `document`,
which doesn't exist inside the Worker this runs in. That mode is what keeps
flattening worker-safe for every PDF, not just ones with embedded fonts.

A PDF that does *not* embed one of its fonts (common for base-14 fonts like
Helvetica or Times) then needs pdfjs's own substitute outlines to draw
anything at all, and its own CMap tables to shape non-Latin or symbolic
encodings correctly. `standardFontDataUrl` and `cMapUrl` point pdfjs at the
vendored copies instead of it trying (and, off a CDN, failing) to fetch them
itself. `cMapPacked: true` because these ship as pdfjs's binary `.bcmap`
format, not plain text.

## Legacy build (3.1.0)

The worker and the main module (`pdfjs-dist/legacy/build/pdf.mjs`, imported in
`pdfFlatten.ts`) are the **legacy** build, for every target. The modern build
does not run in the system WKWebView on macOS 13 (the engine Tauri uses): it
needs `Promise.withResolvers`, `Promise.try`, `URL.parse`, `Math.sumPrecise`
and a global `Iterator` with helpers (missing `Iterator` throws at module
load). The legacy build needs only `Promise.withResolvers`, shimmed in
`lib/codecs/pdfjsCompat.ts` and only where the engine lacks it.

## Regenerating

```
cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/pdfjs/
cp node_modules/pdfjs-dist/standard_fonts/* public/pdfjs/standard_fonts/
cp node_modules/pdfjs-dist/cmaps/* public/pdfjs/cmaps/
```

A `pdfjs-dist` version bump means re-running all three copies and re-checking
the worker's SHA-256 above.

/**
 * Level 3: flatten every page to a JPEG and rebuild the PDF around them.
 * Opt-in only (`keepTextSelectable: false`) -- text and links are gone
 * afterwards, which `compressPdf()` in `pdf.ts` is the one place that
 * decides is acceptable, by comparing this against the level 2 result and
 * keeping whichever is smaller.
 *
 * This is the only place `pdfjs-dist` is imported, and it happens inside
 * `flattenPdf()`, not at module load -- reached only when `pdf.ts` actually
 * attempts a flatten, which itself only happens when the option is off. The
 * default PDF path (`keepTextSelectable: true`, levels 1-2) never loads this
 * module at all.
 *
 * pdfjs-dist's own worker is vendored under /public/pdfjs/ rather than
 * fetched from a CDN, same rule and same reason as the wasm binaries in
 * loader.ts: Turbopack ships this codec worker as a `blob:` URL in
 * production, so a root-relative path has no origin to resolve against
 * unless built into an absolute one first. The standard font data and CMaps
 * under /public/pdfjs/standard_fonts/ and /public/pdfjs/cmaps/ are vendored
 * for the same reason -- see public/pdfjs/PROVENANCE.md.
 *
 * `disableFontFace: true` is what keeps this worker-safe for every PDF, not
 * just the ones with embedded fonts: without it, pdfjs's font loader calls
 * the global `document` (via the FontFace/@font-face path) to register glyph
 * outlines, and `document` does not exist inside a Worker. With it, pdfjs
 * draws every glyph as a filled canvas path instead, which only needs the
 * OffscreenCanvas context already in hand. A PDF that doesn't embed one of
 * its fonts then needs pdfjs's own standard-font substitutes and CMaps to
 * shape and draw glyphs correctly, which is what `standardFontDataUrl` and
 * `cMapUrl` supply.
 */
import type { EncodeOptions } from "./types";
import { resolveAssetUrl } from "./loader";
import { applyPdfjsShims, pdfjsWorkerSrc } from "./pdfjsCompat";

const FLATTEN_SCALE = 150 / 72; // 150dpi, matching the Sprint 2.1 spike

/**
 * `getDocument()`'s default `CanvasFactory` is `DOMCanvasFactory`, which calls
 * `document.createElement("canvas")` -- used internally for soft masks,
 * patterns and (per the `disableFontFace` path above) glyph-path rasterising,
 * regardless of the canvas already handed to `page.render()`. `document` does
 * not exist in a Worker, so without this override every flatten throws
 * `Cannot read properties of undefined (reading 'createElement')` the moment
 * pdfjs needs a canvas of its own. This mirrors `DOMCanvasFactory`'s shape
 * (`create`/`reset`/`destroy`) with `OffscreenCanvas` in place of `document`.
 */
class OffscreenCanvasFactory {
    create(width: number, height: number) {
        if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
        const canvas = new OffscreenCanvas(width, height);
        return { canvas, context: canvas.getContext("2d") };
    }
    reset(canvasAndContext: { canvas?: OffscreenCanvas | null }, width: number, height: number) {
        if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
        if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: { canvas?: OffscreenCanvas | null; context?: unknown }) {
        if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
        canvasAndContext.canvas.width = canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}

/**
 * `getDocument()`'s default `FilterFactory` is `DOMFilterFactory`, which
 * renders SVG `<filter>` elements into `document.body` to implement soft-mask
 * compositing (`/SMask` groups -- gradients, drop shadows, translucent photo
 * edges) via `ctx.filter = "url(#id)"`. That technique is inherently
 * DOM-bound: there is no document in a Worker to host the `<svg>`, and no
 * document-less equivalent of a CSS `url(#id)` filter reference. pdfjs's own
 * Node.js target has the same gap -- `document` doesn't exist there either --
 * and its answer is `NodeFilterFactory`, an *empty* subclass of
 * `BaseFilterFactory` that inherits every method as a no-op returning
 * `"none"`. That class isn't exported from the package, so this reproduces
 * its exact (lack of) behaviour: soft masks are skipped rather than crashing.
 * The tradeoff -- content that used a soft mask rasterises without one -- is
 * pdfjs's own sanctioned answer for "no DOM available", not a workaround
 * invented here.
 */
class NoopFilterFactory {
    addFilter(): string { return "none"; }
    addHCMFilter(): string { return "none"; }
    addAlphaFilter(): string { return "none"; }
    addLuminosityFilter(): string { return "none"; }
    addKnockoutFilter(): string { return "none"; }
    addHighlightHCMFilter(): string { return "none"; }
    addSelectionHCMFilter(): string { return "none"; }
    addSelectionFilter(): string { return "none"; }
    createSelectionStyle(): null { return null; }
    destroy(): void {}
}

/** True if any pixel is not (near-)white. Transparent pixels (alpha 0) don't count as ink. */
function hasInk(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): boolean {
    const d = ctx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) return true;
    }
    return false;
}

export async function flattenPdf(bytes: Uint8Array, options: EncodeOptions): Promise<Uint8Array> {
    // The legacy build (see pdfjsCompat.ts), with its one shim applied before it loads.
    applyPdfjsShims();
    const [pdfjs, pdfLib] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        import("pdf-lib"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(resolveAssetUrl("/pdfjs/pdf.worker.min.mjs"));

    const doc = await pdfjs.getDocument({
        data: bytes,
        disableFontFace: true,
        standardFontDataUrl: resolveAssetUrl("/pdfjs/standard_fonts/"),
        cMapUrl: resolveAssetUrl("/pdfjs/cmaps/"),
        cMapPacked: true,
        CanvasFactory: OffscreenCanvasFactory,
        FilterFactory: NoopFilterFactory,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]).promise;
    const outDoc = await pdfLib.PDFDocument.create();
    // pdf.js can finish "successfully" yet draw nothing in some engines (the macOS 13
    // system WebKit renders every page blank). Blank output must never pass as a result.
    let anyInk = false;

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: FLATTEN_SCALE });
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("DECODE_FAILED: no 2D context available for PDF flatten");

        // pdfjs-dist's types predate OffscreenCanvas support in this API;
        // the object shape it actually reads from at runtime is identical.
        // annotationMode: DISABLE matters here beyond just "we don't want
        // widgets in a flattened page" -- pdfjs's annotation appearance layer
        // calls document.createElement for interactive form/link widgets,
        // and document doesn't exist inside a Worker. Without this, any PDF
        // with links or form fields throws here.
        const renderParams = {
            canvasContext: ctx, canvas, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE,
        } as unknown as Parameters<typeof page.render>[0];
        await page.render(renderParams).promise;
        if (!anyInk) anyInk = hasInk(ctx, canvas.width, canvas.height);

        const blob = await canvas.convertToBlob({
            type: "image/jpeg",
            quality: (options.quality ?? 7) / 10,
        });
        const jpegBytes = new Uint8Array(await blob.arrayBuffer());
        const img = await outDoc.embedJpg(jpegBytes);
        const outPage = outDoc.addPage([viewport.width, viewport.height]);
        outPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });

        // Release this page's resources and pdf.js's shared caches before the next
        // page. Besides bounding memory on long documents, it is load-bearing in the
        // system WKWebView on macOS 13: without it, a later page that reuses
        // resources from an earlier one never finishes rendering (page 3 of a 7-page
        // PDF hung for minutes). Chrome's output is unaffected.
        page.cleanup();
        await doc.cleanup();
    }

    if (!anyInk) throw new Error("FLATTEN_BLANK: every rendered page was blank");
    return outDoc.save();
}

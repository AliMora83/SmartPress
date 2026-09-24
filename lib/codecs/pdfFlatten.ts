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
 * unless built into an absolute one first.
 */
import type { EncodeOptions } from "./types";
import { resolveAssetUrl } from "./loader";

const FLATTEN_SCALE = 150 / 72; // 150dpi, matching the Sprint 2.1 spike

export async function flattenPdf(bytes: Uint8Array, options: EncodeOptions): Promise<Uint8Array> {
    const [pdfjs, pdfLib] = await Promise.all([
        import("pdfjs-dist"),
        import("pdf-lib"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = resolveAssetUrl("/pdfjs/pdf.worker.min.mjs");

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const outDoc = await pdfLib.PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: FLATTEN_SCALE });
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("DECODE_FAILED: no 2D context available for PDF flatten");

        // pdfjs-dist's types predate OffscreenCanvas support in this API;
        // the object shape it actually reads from at runtime is identical.
        const renderParams = { canvasContext: ctx, canvas, viewport } as unknown as Parameters<typeof page.render>[0];
        await page.render(renderParams).promise;

        const blob = await canvas.convertToBlob({
            type: "image/jpeg",
            quality: (options.quality ?? 7) / 10,
        });
        const jpegBytes = new Uint8Array(await blob.arrayBuffer());
        const img = await outDoc.embedJpg(jpegBytes);
        const outPage = outDoc.addPage([viewport.width, viewport.height]);
        outPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }

    return outDoc.save();
}

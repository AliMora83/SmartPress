/**
 * PDF compression.
 *
 * Three levels, from the Sprint 2.1 spike (see AI-Logs.md for the measured
 * table): 1 cleanup (pdf-lib re-save), 2 recompress embedded images (default,
 * text stays selectable), 3 flatten every page to an image via pdfjs-dist
 * (opt-in only, `keepTextSelectable: false`). Levels 1-2 need only `pdf-lib`;
 * level 3 additionally needs `pdfjs-dist`, dynamically imported from
 * `pdfFlatten.ts` and only reached when flattening is actually attempted --
 * turning "keep text selectable" off is what loads it, nothing else does.
 *
 * `pdf-lib` itself is imported dynamically inside `compressPdf()`, not at
 * module load, and this whole module is only ever reached via a dynamic
 * `import("./pdf")` in `worker.ts` when `format === "pdf"`. A JPEG-only batch
 * must never pull either library in -- see the lazy-loading proof in
 * AI-Logs.md. Only pdf-lib's *types* are imported below (`import type`),
 * which TypeScript erases entirely -- nothing runtime-observable comes from
 * that line.
 */
import type { PDFDocument, PDFDict, PDFRawStream } from "pdf-lib";
import type { EncodeOptions } from "./types";
import type { Stage } from "./pool";
import { decode, toPlain } from "./decode";
import { encode } from "./index";

/** Distinguishable from a generic ENCODE_FAILED/DECODE_FAILED -- lib/errors.ts matches on `.name`. */
export class PdfPasswordError extends Error {
    constructor() {
        super("PDF is password-protected");
        this.name = "PdfPasswordError";
    }
}

export class PdfCorruptError extends Error {
    constructor(cause?: unknown) {
        super(cause instanceof Error ? cause.message : String(cause ?? "unreadable"));
        this.name = "PdfCorruptError";
    }
}

export interface PdfCompressResult {
    bytes: Uint8Array;
    pageCount: number;
    /** "signed" = left untouched, on purpose. "flatten-not-smaller" = level 3 was tried and lost to level 2. */
    note?: "signed" | "flatten-not-smaller";
}

/** Long-edge cap for embedded images, matching the Sprint 2.1 spike -- a
 *  heuristic for "sensible print resolution", not a measured DPI target. */
const MAX_LONG_EDGE = 2000;

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as unknown as BlobPart]).stream()
        .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Box filter (area sampling on downscale) -- cheap, and good enough for a
 *  photo about to be re-encoded lossily anyway. */
function downscale(data: Uint8ClampedArray, w: number, h: number, maxEdge: number) {
    if (Math.max(w, h) <= maxEdge) return { data, w, h };
    const scale = maxEdge / Math.max(w, h);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
        const sy = Math.min(h - 1, Math.floor(y / scale));
        for (let x = 0; x < nw; x++) {
            const sx = Math.min(w - 1, Math.floor(x / scale));
            const si = (sy * w + sx) * 4, di = (y * nw + x) * 4;
            out[di] = data[si]; out[di + 1] = data[si + 1];
            out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
        }
    }
    return { data: out, w: nw, h: nh };
}

/** The dynamically-imported `pdf-lib` module's runtime shape. */
type PdfLibModule = typeof import("pdf-lib");

/** Every `/Image` XObject reachable from the document's pages, including
 *  ones nested inside `/Form` XObjects one or more levels deep. */
function findImages(pdfLib: PdfLibModule, doc: PDFDocument): PDFRawStream[] {
    const { PDFName, PDFDict, PDFRawStream } = pdfLib;
    const found: PDFRawStream[] = [];

    function collect(resources: PDFDict | undefined, depth: number) {
        if (!resources || depth > 5) return;
        const xobjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
        if (!xobjects) return;
        for (const [, entry] of xobjects.entries()) {
            const resolved = doc.context.lookup(entry);
            if (!(resolved instanceof PDFRawStream)) continue;
            const subtypeStr = resolved.dict.get(PDFName.of("Subtype"))?.toString() || "";
            if (subtypeStr === "/Form") {
                const innerRes = resolved.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
                collect(innerRes, depth + 1);
                continue;
            }
            if (subtypeStr !== "/Image") continue;
            if (found.includes(resolved)) continue;
            found.push(resolved);
        }
    }
    for (const page of doc.getPages()) collect(page.node.Resources(), 0);
    return found;
}

/**
 * Recompress every embedded image reachable from the document's pages
 * (including inside nested Form XObjects), then re-save.
 *
 * Handles: `/DCTDecode` (JPEG -- decode natively via `decode()`, same path a
 * standalone JPEG file uses, then re-encode via `encode(..., "jpeg", ...)` at
 * the calibrated curve) and 8bpc `/FlateDecode` raw bitmaps in DeviceGray,
 * DeviceRGB, or an ICCBased profile with N=1 or 3 (the common screenshot/
 * photo-export case -- treated as an sRGB-ish approximation, not colour-
 * managed). Everything else -- JPX, CCITT, indexed/other bpcs, image masks,
 * predictor-filtered or oddly-sized raw bitmaps -- is left untouched, never
 * failed; the spike found none of these in the three real fixtures it
 * measured, so this is a safety net rather than a tested path.
 *
 * An `/SMask` reference is deliberately not a skip condition: it points at a
 * *separate* grayscale stream object, not extra channels inside this image's
 * own pixel data, so recompressing the base image leaves it untouched and
 * still correctly composited. (An early version of the Task 0 spike skipped
 * on SMask presence and it cost ~40 percentage points of real-world savings
 * -- see AI-Logs.md.) Downscaling *would* need to resize the mask to match,
 * which is why it isn't attempted here.
 */
async function recompressImages(
    pdfLib: PdfLibModule,
    doc: PDFDocument,
    options: EncodeOptions,
    onImage: (done: number, total: number) => void,
): Promise<void> {
    const images = findImages(pdfLib, doc);
    for (let i = 0; i < images.length; i++) {
        await recompressOne(images[i], pdfLib, options);
        onImage(i + 1, images.length);
    }
}

async function recompressOne(
    stream: PDFRawStream,
    pdfLib: PdfLibModule,
    options: EncodeOptions,
): Promise<void> {
    const { PDFName, PDFNumber, PDFArray, PDFBool, PDFRawStream } = pdfLib;
    const n = (name: string) => PDFName.of(name);
    const dict = stream.dict;
    const filterStr = dict.get(n("Filter"))?.toString() || "(none)";
    const isMask = dict.lookupMaybe(n("ImageMask"), PDFBool);
    const width = dict.lookupMaybe(n("Width"), PDFNumber)?.asNumber();
    const height = dict.lookupMaybe(n("Height"), PDFNumber)?.asNumber();
    const bpc = dict.lookupMaybe(n("BitsPerComponent"), PDFNumber)?.asNumber();
    const colorSpaceRaw = dict.get(n("ColorSpace"));
    let colorSpaceStr = colorSpaceRaw ? colorSpaceRaw.toString() : "(none)";

    if (isMask?.asBoolean()) return; // stencil mask, not a photo
    if (colorSpaceRaw instanceof PDFArray && colorSpaceRaw.get(0)?.toString() === "/ICCBased") {
        const profileObj = dict.context.lookup(colorSpaceRaw.get(1));
        const nVal = profileObj instanceof PDFRawStream
            ? profileObj.dict.lookupMaybe(n("N"), PDFNumber)?.asNumber()
            : undefined;
        if (nVal === 1) colorSpaceStr = "/DeviceGray";
        else if (nVal === 3) colorSpaceStr = "/DeviceRGB";
        else return; // unhandled ICC profile shape -- left untouched
    }
    if (width === undefined || height === undefined) return;

    let pixels: { data: Uint8ClampedArray; width: number; height: number };
    if (filterStr === "/DCTDecode") {
        try {
            const img = await decode(new Blob([stream.contents as unknown as BlobPart], { type: "image/jpeg" }));
            pixels = toPlain(img);
        } catch { return; } // not a JPEG our native decoder can read -- left untouched
    } else if (filterStr === "/FlateDecode") {
        if (bpc !== 8 || (colorSpaceStr !== "/DeviceRGB" && colorSpaceStr !== "/DeviceGray")) return;
        let raw: Uint8Array;
        try { raw = await inflate(stream.contents); } catch { return; }
        const channels = colorSpaceStr === "/DeviceGray" ? 1 : 3;
        if (raw.length !== width * height * channels) return; // predictor-filtered or malformed -- left untouched
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            if (channels === 1) {
                const v = raw[i];
                rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
            } else {
                rgba[i * 4] = raw[i * 3]; rgba[i * 4 + 1] = raw[i * 3 + 1];
                rgba[i * 4 + 2] = raw[i * 3 + 2]; rgba[i * 4 + 3] = 255;
            }
        }
        pixels = { data: rgba, width, height };
    } else {
        return; // JPX, CCITT, or anything else -- left untouched
    }

    const resized = downscale(pixels.data, pixels.width, pixels.height, MAX_LONG_EDGE);
    const encoded = new Uint8Array(await encode(
        { data: resized.data, width: resized.w, height: resized.h }, "jpeg", options,
    ));
    // Skip only if recompressing genuinely made it bigger -- rare, but a
    // deeply-optimised source JPEG at a low target quality can lose to
    // itself, and that must not regress the file.
    if (encoded.byteLength >= stream.contents.length) return;

    dict.set(n("Filter"), n("DCTDecode"));
    dict.delete(n("DecodeParms"));
    if (resized.w !== pixels.width || resized.h !== pixels.height) {
        dict.set(n("Width"), PDFNumber.of(resized.w));
        dict.set(n("Height"), PDFNumber.of(resized.h));
    }
    // jsquash's mozjpeg encoder always emits a 3-component colour JPEG from
    // RGBA input regardless of source channel count, so ColorSpace is
    // normalized rather than preserved.
    dict.set(n("ColorSpace"), n("DeviceRGB"));
    // `.contents` is declared readonly in pdf-lib's own types -- there is no
    // public setter, and low-level stream surgery like this is exactly what
    // that field exists for. The cast is narrow and local to this one write.
    (stream as unknown as { contents: Uint8Array }).contents = encoded;
}

/**
 * `SigFlags` bit 1 (`SignaturesExist`) or any field with `/FT /Sig` means
 * this PDF carries a signature. Detected before anything touches the bytes,
 * since pdf-lib has no notion of signatures and re-saving would silently
 * invalidate one.
 */
function isSigned(pdfLib: PdfLibModule, doc: PDFDocument): boolean {
    const { PDFName, PDFNumber } = pdfLib;
    const acroForm = doc.catalog.getAcroForm();
    if (!acroForm) return false;
    const sigFlags = acroForm.dict.lookupMaybe(PDFName.of("SigFlags"), PDFNumber)?.asNumber();
    if (typeof sigFlags === "number" && (sigFlags & 1) === 1) return true;
    for (const [field] of acroForm.getAllFields()) {
        const ft = field.dict.get(PDFName.of("FT"));
        if (ft?.toString() === "/Sig") return true;
    }
    return false;
}

export async function compressPdf(
    file: Blob,
    options: EncodeOptions,
    onProgress?: (progress: number, stage: Stage) => void,
): Promise<PdfCompressResult> {
    onProgress?.(5, "decoding");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const pdfLib = await import("pdf-lib");
    const { PDFDocument: PDFDocumentCtor } = pdfLib;

    let doc: PDFDocument;
    try {
        doc = await PDFDocumentCtor.load(bytes, { updateMetadata: false });
    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes("encrypted")) {
            throw new PdfPasswordError();
        }
        throw new PdfCorruptError(e);
    }

    const pageCount = doc.getPageCount();

    if (isSigned(pdfLib, doc)) {
        // Left byte-for-byte untouched. isWorthKeeping() in Compressor.tsx
        // will see zero gain and choose "keep original" on its own; the
        // `note` is only so the row can say *why* in different words than
        // the generic "no size reduction" message.
        return { bytes, pageCount, note: "signed" };
    }

    onProgress?.(15, "encoding");
    let recompressed: Uint8Array;
    try {
        doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]);
        doc.setProducer("SmartPress"); doc.setCreator("");
        await recompressImages(pdfLib, doc, options, (done, total) => {
            onProgress?.(15 + Math.round(60 * (total ? done / total : 1)), "encoding");
        });
        recompressed = await doc.save({ useObjectStreams: true });
    } catch (e) {
        throw new PdfCorruptError(e);
    }

    const keepTextSelectable = options.keepTextSelectable ?? true;
    if (keepTextSelectable) {
        onProgress?.(100, "encoding");
        return { bytes: recompressed, pageCount };
    }

    onProgress?.(80, "encoding");
    let flattened: Uint8Array | null = null;
    try {
        const { flattenPdf } = await import("./pdfFlatten");
        flattened = await flattenPdf(bytes, options);
    } catch {
        flattened = null; // flattening is opt-in extra; a failure here must not fail a compression that already succeeded at level 2
    }
    onProgress?.(100, "encoding");

    if (flattened && flattened.byteLength < recompressed.byteLength) {
        return { bytes: flattened, pageCount };
    }
    return { bytes: recompressed, pageCount, note: flattened ? "flatten-not-smaller" : undefined };
}

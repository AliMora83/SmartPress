import type { ImageDataLike } from "./types";
import { orientationTransform, readJpegOrientation } from "./exifOrientation";

/**
 * Native decode. Browsers decode JPEG and PNG in hardware already, so shipping
 * wasm decoders would double the payload for no gain -- the plan's decision.
 * Measured at <=106 ms per file during the spike.
 *
 * Orientation is load-bearing: without it, EXIF-rotated phone photos come out
 * sideways (see CLAUDE.md). The first choice is always
 * `createImageBitmap(file, { imageOrientation: "from-image" })`. Some engines
 * (the system WKWebView on macOS 13, which Tauri uses) throw a TypeError for that
 * option; only then does the fallback run, and Chrome never reaches it.
 */
export async function decode(file: Blob): Promise<ImageData> {
    const { bitmap, upright } = await decodeBitmap(file);
    try {
        if (upright) return draw(bitmap, bitmap.width, bitmap.height, [1, 0, 0, 1, 0, 0]);
        // The engine hands back raw pixel order: apply the file's EXIF orientation ourselves.
        const o = readJpegOrientation(new Uint8Array(await file.arrayBuffer()));
        const t = orientationTransform(o, bitmap.width, bitmap.height);
        return draw(bitmap, t.width, t.height, t.matrix);
    } finally {
        bitmap.close();
    }
}

function draw(
    bitmap: ImageBitmap, width: number, height: number,
    m: [number, number, number, number, number, number],
): ImageData {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("DECODE_FAILED: no 2D context available");
    ctx.setTransform(...m);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, width, height);
}

/** Set once `from-image` has thrown, so later files skip the failing call. */
let fromImageUnsupported = false;
/** Whether plain `createImageBitmap` already applies EXIF orientation. Probed once per realm. */
let plainAutoOrients: Promise<boolean> | undefined;

async function decodeBitmap(file: Blob): Promise<{ bitmap: ImageBitmap; upright: boolean }> {
    if (!fromImageUnsupported) {
        try {
            return { bitmap: await createImageBitmap(file, { imageOrientation: "from-image" }), upright: true };
        } catch (e) {
            // Only the unsupported-option TypeError is handled; a corrupt file must still fail.
            if (!(e instanceof TypeError)) throw e;
            fromImageUnsupported = true;
        }
    }
    const upright = await (plainAutoOrients ??= probePlainOrientation());
    return { bitmap: await createImageBitmap(file), upright };
}

/** 2x1 JPEG stored sideways with EXIF orientation 6: upright it is 1x2. */
const PROBE_JPEG =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAIDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+Rb4g/wDI/eN/+xv8S/8Ap6va/wC076Cf/KEP0N/+0Vfo8/8Aro+EDy/pm/8AKYP0rv8AtJTx0/8AXocUn//Z";

async function probePlainOrientation(): Promise<boolean> {
    const bytes = Uint8Array.from(atob(PROBE_JPEG), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    try {
        return bitmap.width === 1 && bitmap.height === 2;
    } finally {
        bitmap.close();
    }
}

/** Structured-clone-safe view, for passing across a worker boundary. */
export function toPlain(image: ImageData): ImageDataLike {
    return { data: image.data, width: image.width, height: image.height };
}

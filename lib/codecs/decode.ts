import type { ImageDataLike } from "./types";

/**
 * Native decode. Browsers decode JPEG and PNG in hardware already, so shipping
 * wasm decoders would double the payload for no gain -- the plan's decision.
 * Measured at <=106 ms per file during the spike.
 *
 * imageOrientation is load-bearing: without it, EXIF-rotated phone photos come
 * out sideways (see CLAUDE.md).
 */
export async function decode(file: Blob): Promise<ImageData> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("DECODE_FAILED: no 2D context available");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } finally {
        bitmap.close();
    }
}

/** Structured-clone-safe view, for passing across a worker boundary. */
export function toPlain(image: ImageData): ImageDataLike {
    return { data: image.data, width: image.width, height: image.height };
}

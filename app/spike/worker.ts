/**
 * SPIKE ONLY — throwaway. Not referenced by the app.
 *
 * The point of this file is to find out whether Next's bundler cooperates with
 * icodec's wasm loading inside a module worker. It deliberately does NOT let the
 * package resolve its own .wasm: both loaders accept raw bytes, so we fetch the
 * vendored binaries from /public/wasm/ and hand them over. That sidesteps
 * bundler wasm asset handling entirely, which is the whole integration risk.
 */
import { jpeg, png } from "icodec";

type Job = {
    id: number;
    codec: "jpeg" | "png";
    data: Uint8ClampedArray;
    width: number;
    height: number;
    quality: number;
};

let ready: Promise<void> | null = null;

function init() {
    // Importing the "icodec" barrel is load-bearing: it is what assigns
    // globalThis._icodec_ImageData, which png.decode and toBitDepth call unqualified.
    // Importing icodec/lib/png.js directly throws a ReferenceError at encode time.
    ready ??= (async () => {
        const [jpegWasm, pngWasm] = await Promise.all([
            fetch("/wasm/mozjpeg.wasm").then(r => r.arrayBuffer()),
            fetch("/wasm/pngquant_bg.wasm").then(r => r.arrayBuffer()),
        ]);
        await jpeg.loadEncoder(jpegWasm);
        await png.loadEncoder(pngWasm);
    })();
    return ready;
}

self.onmessage = async (e: MessageEvent<Job>) => {
    const { id, codec, data, width, height, quality } = e.data;
    try {
        const t0 = performance.now();
        await init();
        const tReady = performance.now();

        const image = { data, width, height, depth: 8 };
        const out: Uint8Array =
            codec === "jpeg"
                ? jpeg.encode(image, { quality })
                : png.encode(image, { quality, quantize: true, speed: 4, dithering: 1 });

        const t1 = performance.now();
        const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
        (self as unknown as Worker).postMessage(
            { id, ok: true, bytes: buf, byteLength: out.byteLength, loadMs: tReady - t0, encodeMs: t1 - tReady },
            [buf],
        );
    } catch (err) {
        (self as unknown as Worker).postMessage({
            id,
            ok: false,
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
    }
};

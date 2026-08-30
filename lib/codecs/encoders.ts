import { loadWasm } from "./loader";
import { nativeQuality } from "./quality";
import type { Format, ImageDataLike } from "./types";

/**
 * Per-format encoders, each behind a dynamic import so nothing loads until the
 * format is actually requested. This is the requirement that disqualified
 * icodec, whose exports map forced a barrel import of all eight codecs.
 *
 * Each encoder is initialised once and memoised.
 */

type Encoder = (image: ImageDataLike, scale: number) => Promise<Uint8Array>;

const ready = new Map<Format, Promise<Encoder>>();

/** SIMD is near-universal, but @jsquash picks the build at runtime, so the
 *  vendored module we hand over has to match what detection chose. */
async function hasSimd(): Promise<boolean> {
    try {
        const { simd } = await import("wasm-feature-detect");
        return await simd();
    } catch {
        return false;
    }
}

async function makeJpeg(): Promise<Encoder> {
    const [{ default: encode, init }, module] = await Promise.all([
        import("@jsquash/jpeg/encode.js"),
        loadWasm("mozjpeg_enc.wasm"),
    ]);
    await init(module);
    return async (image, scale) => {
        const buf = await encode(image as ImageData, { quality: nativeQuality("jpeg", scale) });
        return new Uint8Array(buf);
    };
}

async function makeWebp(): Promise<Encoder> {
    const simd = await hasSimd();
    const [{ default: encode, init }, module] = await Promise.all([
        import("@jsquash/webp/encode.js"),
        loadWasm(simd ? "webp_enc_simd.wasm" : "webp_enc.wasm"),
    ]);
    await init(module);
    return async (image, scale) => {
        const buf = await encode(image as ImageData, { quality: nativeQuality("webp", scale) });
        return new Uint8Array(buf);
    };
}

async function makeAvif(): Promise<Encoder> {
    // AVIF is UNAVAILABLE in this build. @jsquash/avif in the module graph
    // stalls `next build` under Turbopack indefinitely -- bisected in Sprint
    // 1.2: JPEG+PNG+WebP build in 16.7s, adding AVIF never completes (killed
    // at 10 min against a ~15s baseline). Same signature as the icodec spike.
    //
    // Nothing here is needed before Sprint 2.2 (format conversion), so the
    // sprint ships without it rather than blocking. To re-enable, restore the
    // import below, vendor avif_enc.wasm, and re-test the build first:
    //
    //   const [{ default: encode, init }, module] = await Promise.all([
    //       import("@jsquash/avif/encode.js"),
    //       loadWasm("avif_enc.wasm"),
    //   ]);
    //   await init(module);
    //   return async (image, scale) => new Uint8Array(
    //       await encode(image as ImageData, { quality: nativeQuality("avif", scale) }));
    throw new Error(
        "AVIF is unavailable in this build: @jsquash/avif stalls the Turbopack " +
        "production build. See AI-Logs.md, Sprint 1.2.",
    );
}

async function makePng(): Promise<Encoder> {
    // Vendored, not an npm package: @jsquash has no quantizer and its two PNG
    // packages are lossless-only. This is imagequant (GPL-3.0-or-later) --
    // see NOTICE and public/wasm/PROVENANCE.md.
    const [glue, module] = await Promise.all([
        import("./vendor/pngquant.js"),
        loadWasm("pngquant_bg.wasm"),
    ]);
    const { default: init, optimize } = glue as unknown as {
        default: (arg: { module_or_path: WebAssembly.Module }) => Promise<unknown>;
        optimize: (
            data: Uint8ClampedArray, width: number, height: number,
            options: Record<string, unknown>,
        ) => Uint8Array;
    };
    await init({ module_or_path: module });
    return async (image, scale) => {
        return optimize(image.data, image.width, image.height, {
            quality: nativeQuality("png", scale),
            quantize: true,
            speed: 4,
            dithering: 1,
            level: 3,
            interlace: false,
            colors: 256,
            bit_depth: 8,
        });
    };
}

const FACTORIES: Record<Format, () => Promise<Encoder>> = {
    jpeg: makeJpeg,
    png: makePng,
    webp: makeWebp,
    avif: makeAvif,
};

export function getEncoder(format: Format): Promise<Encoder> {
    let pending = ready.get(format);
    if (!pending) {
        pending = FACTORIES[format]();
        ready.set(format, pending);
        pending.catch(() => ready.delete(format));
    }
    return pending;
}

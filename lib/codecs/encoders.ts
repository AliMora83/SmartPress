import { loadWasm } from "./loader";
import { DEFAULT_PNG_MODE, resolveEffort, resolveNative } from "./quality";
import type { EncodeOptions, Format, ImageDataLike } from "./types";

/**
 * Per-format encoders, each behind a dynamic import so nothing loads until the
 * format is actually requested. This is the requirement that disqualified
 * icodec, whose exports map forced a barrel import of all eight codecs.
 *
 * Each encoder is initialised once and memoised.
 */

type Encoder = (image: ImageDataLike, options: EncodeOptions) => Promise<Uint8Array>;

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
    return async (image, options) => {
        const buf = await encode(image as ImageData, { quality: resolveNative("jpeg", options) });
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
    return async (image, options) => {
        const buf = await encode(image as ImageData, { quality: resolveNative("webp", options) });
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
    return async (image, options) => {
        // Two paths behind one codec. Lossy quantizes to a palette and spends
        // the control on quality; lossless keeps every pixel and spends it on
        // oxipng effort instead, so the slider never goes dead. `quantize`
        // is what the vendored binary switches on.
        const lossless = (options.pngMode ?? DEFAULT_PNG_MODE) === "lossless";
        // The options struct is deserialised whole on the Rust side and its
        // fields have no defaults -- a partial object fails inside wasm with an
        // opaque `unwrap_throw` panic. So both paths pass every field and differ
        // only in `quantize` and what the control feeds.
        return optimize(image.data, image.width, image.height, {
            quality: lossless ? 100 : resolveNative("png", options),
            quantize: !lossless,
            speed: 4,
            dithering: 1,
            // Lossy fixes oxipng effort at 3 and spends the control on palette
            // quality; lossless has no quality to trade, so the control buys
            // effort here instead and the slider never goes dead.
            level: lossless ? resolveEffort(options) : 3,
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

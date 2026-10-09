/**
 * EXIF orientation, for engines whose `createImageBitmap` can't orient for us
 * (see decode.ts). JPEG only: that is where phone cameras put the tag.
 */

/** EXIF orientation 1-8 from a JPEG's APP1 block, or 1 when absent or unreadable. */
export function readJpegOrientation(bytes: Uint8Array): number {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 2;
    while (p + 4 <= bytes.length && bytes[p] === 0xff) {
        const marker = bytes[p + 1];
        if (marker === 0xda || marker === 0xd9) break; // image data / end: no EXIF after this
        const len = view.getUint16(p + 2);
        // APP1 "Exif\0\0"
        if (marker === 0xe1 && len >= 16 && view.getUint32(p + 4) === 0x45786966 && view.getUint16(p + 8) === 0) {
            const tiff = p + 10;
            const order = view.getUint16(tiff);
            const le = order === 0x4949;
            if (!le && order !== 0x4d4d) return 1;
            if (view.getUint16(tiff + 2, le) !== 42) return 1;
            const ifd = tiff + view.getUint32(tiff + 4, le);
            if (ifd + 2 > bytes.length) return 1;
            const count = view.getUint16(ifd, le);
            for (let i = 0; i < count; i++) {
                const e = ifd + 2 + i * 12;
                if (e + 12 > bytes.length) return 1;
                if (view.getUint16(e, le) === 0x0112) {
                    const v = view.getUint16(e + 8, le);
                    return v >= 1 && v <= 8 ? v : 1;
                }
            }
            return 1;
        }
        p += 2 + len;
    }
    return 1;
}

/**
 * Canvas transform that draws an unoriented w x h image upright for EXIF
 * orientation 1-8, plus the upright size (5-8 swap width and height).
 */
export function orientationTransform(o: number, w: number, h: number): {
    width: number; height: number; matrix: [number, number, number, number, number, number];
} {
    switch (o) {
        case 2: return { width: w, height: h, matrix: [-1, 0, 0, 1, w, 0] };
        case 3: return { width: w, height: h, matrix: [-1, 0, 0, -1, w, h] };
        case 4: return { width: w, height: h, matrix: [1, 0, 0, -1, 0, h] };
        case 5: return { width: h, height: w, matrix: [0, 1, 1, 0, 0, 0] };
        case 6: return { width: h, height: w, matrix: [0, 1, -1, 0, h, 0] };
        case 7: return { width: h, height: w, matrix: [0, -1, -1, 0, h, w] };
        case 8: return { width: h, height: w, matrix: [0, -1, 1, 0, 0, w] };
        default: return { width: w, height: h, matrix: [1, 0, 0, 1, 0, 0] };
    }
}

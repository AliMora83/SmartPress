// One-off generator for the app's icons (not part of the build; output is committed).
// Source: docs/design-system/smartpress-mark.svg -- the logo mark, never fixtures.
// Run: node scripts/make-icons.mjs  (uses sharp, which ships with Next).
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const GROUND = "#0C0E12"; // bg-ground, docs/design-system/tokens.json
const mark = readFileSync("docs/design-system/smartpress-mark.svg", "utf8")
    .replace(/<svg[^>]*>/, "").replace("</svg>", "");

// `fraction` is how much of the canvas the 28-unit mark box fills. Maskable icons
// keep it inside the 80% safe circle (the mark box's corner sits ~0.707*fraction from centre).
function svg(size, fraction) {
    const s = (size * fraction) / 28, off = (size - 28 * s) / 2;
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<rect width="${size}" height="${size}" fill="${GROUND}"/><g transform="translate(${off} ${off}) scale(${s})" fill="none">${mark}</g></svg>`);
}

/**
 * ICO container around already-encoded PNGs, which every browser since IE11
 * accepts. Written by hand rather than with a library: this is a 6-byte header
 * and a 16-byte row per size, and the alternative is a dependency carried in
 * package.json forever for a script that runs when the logo changes.
 */
function ico(pngs) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);          // reserved
    header.writeUInt16LE(1, 2);          // 1 = icon
    header.writeUInt16LE(pngs.length, 4);
    let offset = 6 + pngs.length * 16;
    const entries = pngs.map(({ size, data }) => {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
        e.writeUInt8(size >= 256 ? 0 : size, 1);
        e.writeUInt8(0, 2);              // palette colours
        e.writeUInt8(0, 3);              // reserved
        e.writeUInt16LE(1, 4);           // colour planes
        e.writeUInt16LE(32, 6);          // bits per pixel
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += data.length;
        return e;
    });
    return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]);
}

const render = (size, fraction) =>
    sharp(svg(size, fraction), { density: 288 }).resize(size, size).png().toBuffer();

const out = [
    ["icon-192.png", 192, 0.62], ["icon-512.png", 512, 0.62], ["icon-maskable-512.png", 512, 0.5],
];
for (const [name, size, f] of out) {
    writeFileSync(`public/icons/${name}`, await render(size, f));
    console.log("wrote public/icons/" + name);
}

// The browser tab. A favicon is read at 16px in a strip of other tabs, so the
// mark fills more of the canvas here than it does as an app icon -- at 0.62 the
// rounded rect reads as a smudge with a gap around it. The ground square is
// kept rather than going transparent, because the mark is a stroke-only outline
// and a light tab strip would leave it floating.
const FAVICON_FRACTION = 0.78;
const sizes = [16, 32, 48];
writeFileSync("app/favicon.ico", ico(await Promise.all(
    sizes.map(async size => ({ size, data: await render(size, FAVICON_FRACTION) })),
)));
console.log("wrote app/favicon.ico (" + sizes.join(", ") + ")");

// Next's app-dir icon, used where a single larger PNG is wanted (Safari's
// bookmark list, a link preview).
writeFileSync("app/icon.png", await render(512, 0.62));
console.log("wrote app/icon.png");

// One-off generator for the PWA icons (not part of the build; output is committed).
// Source: docs/design-system/smartpress-mark.svg -- the logo mark, never fixtures.
// Run: node scripts/make-icons.mjs  (uses sharp, which ships with Next).
import { readFileSync } from "node:fs";
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

const out = [
    ["icon-192.png", 192, 0.62], ["icon-512.png", 512, 0.62], ["icon-maskable-512.png", 512, 0.5],
];
for (const [name, size, f] of out) {
    await sharp(svg(size, f), { density: 288 }).resize(size, size).png().toFile(`public/icons/${name}`);
    console.log("wrote public/icons/" + name);
}

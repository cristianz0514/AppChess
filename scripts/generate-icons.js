// Run once: node scripts/generate-icons.js
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const BG = "#0B0D0F";
const FG = "#e2e8f0";
const outDir = path.join(__dirname, "../public/icons");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function svg(size) {
  const pad = Math.round(size * 0.12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${BG}"/>
  <text
    x="50%"
    y="54%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-size="${size - pad * 2}"
    font-family="serif"
    fill="${FG}"
  >♞</text>
</svg>`;
}

(async () => {
  // Primary manifest icons
  await sharp(Buffer.from(svg(192))).png().toFile(path.join(outDir, "icon-192.png"));
  console.log("✓ icon-192.png");

  await sharp(Buffer.from(svg(512))).png().toFile(path.join(outDir, "icon-512.png"));
  console.log("✓ icon-512.png");

  // Apple touch icon (180×180)
  await sharp(Buffer.from(svg(180))).png().toFile(path.join(__dirname, "../public/apple-touch-icon.png"));
  console.log("✓ apple-touch-icon.png");

  // Favicon (32×32)
  await sharp(Buffer.from(svg(32))).png().toFile(path.join(__dirname, "../public/favicon-32x32.png"));
  console.log("✓ favicon-32x32.png");

  console.log("\nAll icons generated.");
})();

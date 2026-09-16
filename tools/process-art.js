// Art pipeline: raw AI JPGs → cutout PNGs (transparent bg, despeckled, normalized,
// feet-aligned) + hat-color classification report. Run: npm run art

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Jimp = require("jimp").Jimp;

const RAW = path.resolve("assets/sprites/raw");
const OUT = path.resolve("assets/sprites/processed");

// Expected hats (hue ranges) → dwarf ids
const HUE_RANGES = [
  ["doc", 15, 45],      // amber/orange
  ["grumpy", 345, 376], // red (wraps)
  ["happy", 45, 70],    // yellow
  ["sleepy", 195, 240], // blue
  ["sneezy", 90, 150],  // green
  ["bashful", 300, 345],// pink
  ["dopey", 240, 290],  // purple
];

function toHue(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  if (max === min) return -1;
  const d = max - min;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

function classifyHat(image, mask) {
  // Sample the hat region: top 25% of the character bbox, most saturated colorful cluster.
  const { minX, minY, maxX, maxY } = bbox(mask, image.bitmap.width, image.bitmap.height);
  const counts = new Map();
  for (let y = minY; y < minY + (maxY - minY) * 0.28; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = y * image.bitmap.width + x;
      if (!mask[idx]) continue;
      const i = idx * 4;
      const [r, g, b] = [image.bitmap.data[i], image.bitmap.data[i + 1], image.bitmap.data[i + 2]];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 40 || max < 60) continue; // gray/dark = not the hat
      const hue = toHue(r, g, b);
      const key = Math.floor(hue / 10) * 10;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let best = null, bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { bestN = n; best = k + 5; }
  if (best === null) return { dwarf: "?", hue: -1 };
  for (const [id, lo, hi] of HUE_RANGES) {
    if ((best >= lo && best <= hi) || (hi > 360 && best + 360 >= lo && best + 360 <= hi)) return { dwarf: id, hue: best };
  }
  return { dwarf: "?", hue: best };
}

function bbox(mask, w, h) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { minX, minY, maxX, maxY };
}

function cutout(image) {
  const { width: w, height: h, data } = image.bitmap;
  // bg color = median of the 4 corners (5px patches)
  const samples = [];
  const grab = (x0, y0) => { for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) { const i = (y * w + x) * 4; samples.push([data[i], data[i + 1], data[i + 2]]); } };
  grab(0, 0); grab(w - 6, 0); grab(0, h - 6); grab(w - 6, h - 6);
  const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const bg = [med(samples.map((s) => s[0])), med(samples.map((s) => s[1])), med(samples.map((s) => s[2]))];

  // BFS flood fill from all border pixels within tolerance → background
  const tol = 60; // color distance
  const bgMask = new Uint8Array(w * h);
  const queue = [];
  const near = (i) => {
    const j = i * 4;
    const d = Math.abs(data[j] - bg[0]) + Math.abs(data[j + 1] - bg[1]) + Math.abs(data[j + 2] - bg[2]);
    return d < tol;
  };
  for (let x = 0; x < w; x++) { queue.push(x, x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { queue.push(y * w, y * w + w - 1); }
  while (queue.length) {
    const idx = queue.pop();
    if (idx < 0 || idx >= w * h || bgMask[idx]) continue;
    if (!near(idx)) continue;
    bgMask[idx] = 1;
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) queue.push(idx - 1);
    if (x < w - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - w);
    if (y < h - 1) queue.push(idx + w);
  }

  // mask = NOT background; despeckle: drop isolated keep-pixels
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = bgMask[i] ? 0 : 1;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i / w) | 0;
    let neighbors = 0;
    if (x > 0 && mask[i - 1]) neighbors++;
    if (x < w - 1 && mask[i + 1]) neighbors++;
    if (y > 0 && mask[i - w]) neighbors++;
    if (y < h - 1 && mask[i + w]) neighbors++;
    if (neighbors === 0) mask[i] = 0;
  }

  // apply alpha
  for (let i = 0; i < w * h; i++) {
    data[i * 4 + 3] = mask[i] ? 255 : 0;
  }
  return mask;
}

const TARGET_H = 256;

async function processFile(file, report) {
  const img = await Jimp.read(path.join(RAW, file));
  const mask = cutout(img);
  const bb = bbox(mask, img.bitmap.width, img.bitmap.height);
  const { dwarf, hue } = classifyHat(img, mask);
  // crop to content + margin, scale to target height (nearest-ish: Jimp resize with nearestNeighbor)
  const pad = 8;
  const cw = Math.min(img.bitmap.width, bb.maxX - bb.minX + 1 + pad * 2);
  const ch = Math.min(img.bitmap.height, bb.maxY - bb.minY + 1 + pad * 2);
  img.crop({ x: Math.max(0, bb.minX - pad), y: Math.max(0, bb.minY - pad), w: cw, h: ch });
  // No resize — CSS scales at display time (image-rendering: pixelated).
  report.push({ file, dwarf, hue, size: `${img.bitmap.width}x${img.bitmap.height}` });
  return img;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(RAW).filter((f) => /\.jpe?g$/i.test(f));
  // Final cast map (art-QA decisions) overrides hue classification.
  const mapPath = path.join(OUT, "_final_map.json");
  const finalMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};
  const report = [];
  const saved = new Map();
  for (const f of files) {
    try {
      const img = await processFile(f, report);
      saved.set(f, img);
    } catch (e) {
      report.push({ file: f, error: String(e) });
    }
  }
  // Primary cast from the explicit map; classifier output stays in the report as reference.
  const usedFiles = new Set();
  for (const [file, dwarf] of Object.entries(finalMap)) {
    if (!saved.has(file)) { console.warn("map file missing:", file); continue; }
    await saved.get(file).write(path.join(OUT, `${dwarf}.png`));
    usedFiles.add(file);
  }
  let alt = 1;
  for (const [file, img] of saved) {
    if (usedFiles.has(file)) continue;
    const entry = report.find((r) => r.file === file);
    await img.write(path.join(OUT, `alt_${alt++}_${entry && entry.dwarf !== "?" ? entry.dwarf : "unknown"}.png`));
  }
  console.table(report);
  console.log("written:", fs.readdirSync(OUT).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });

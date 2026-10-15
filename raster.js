// PNG/JPG rendering of the generated SVGs (SPECS.md §5.1): framing, font
// embedding and 72 dpi metadata. No UI code.

import { FONT_URLS, SVG_NS, serializeElement, squareFrame } from './pie.js';

export const RASTER_SIDE = 1080; // px, square side at ×1
export const RASTER_SCALES = [1, 2, 4];
export const JPEG_QUALITY = 0.92;
export const DPI = 72;
export const FORMATS = {
  png: { mime: 'image/png', extension: 'png' },
  jpg: { mime: 'image/jpeg', extension: 'jpg' },
};

const FONT_FAMILY = 'PT Sans';
const PATH_SAMPLES = 64; // points sampled per path for the legend's bounding box
const INCHES_PER_METRE = 39.3701;

// --- Fonts ----------------------------------------------------------------------

let fontCssPromise = null;

function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fontFace(url, weight) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font: could not load ${url} (HTTP ${response.status}).`);
  const data = toBase64(new Uint8Array(await response.arrayBuffer()));
  return (
    `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:${weight};` +
    `src:url(data:font/woff2;base64,${data}) format('woff2');}`
  );
}

// @font-face rules with the vendored PT Sans Regular and Bold as base64.
export function fontCss() {
  fontCssPromise ??= Promise.all([
    fontFace(FONT_URLS.regular, 400),
    fontFace(FONT_URLS.bold, 700),
  ]).then((rules) => rules.join(''));
  return fontCssPromise;
}

function embedFonts(doc, css) {
  const root = doc.documentElement;
  let style = [...root.children].find((el) => el.localName === 'style');
  if (!style) {
    style = doc.createElementNS(SVG_NS, 'style');
    root.prepend(style);
  }
  style.textContent = css + style.textContent;
}

// --- Framing ------------------------------------------------------------------

/**
 * Tight bounding box of the #Legend group in the SVG's user units, measured in
 * a hidden copy attached to `doc` with the embedded fonts. Returns null if the
 * SVG has no legend.
 */
export async function measureLegend(svgText, doc = document) {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (!parsed.getElementById('Legend')) return null;
  embedFonts(parsed, await fontCss());
  const [, , width, height] = parsed.documentElement
    .getAttribute('viewBox')
    .split(/[\s,]+/)
    .map(Number);
  const svg = doc.importNode(parsed.documentElement, true);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
  doc.body.append(svg);
  try {
    await doc.fonts.load(`700 40px '${FONT_FAMILY}'`);
    await doc.fonts.load(`400 40px '${FONT_FAMILY}'`);
    await doc.fonts.ready;
    // Element coordinates → root user units.
    const rootInverse = svg.getScreenCTM().inverse();
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const addPoint = (point, matrix) => {
      const p = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      box.left = Math.min(box.left, p.x);
      box.top = Math.min(box.top, p.y);
      box.right = Math.max(box.right, p.x);
      box.bottom = Math.max(box.bottom, p.y);
    };
    for (const el of svg.querySelectorAll('#Legend path, #Legend text')) {
      const matrix = rootInverse.multiply(el.getScreenCTM());
      if (el.localName === 'path') {
        const length = el.getTotalLength();
        for (let i = 0; i <= PATH_SAMPLES; i++)
          addPoint(el.getPointAtLength((length * i) / PATH_SAMPLES), matrix);
      } else {
        const b = el.getBBox();
        for (const [px, py] of [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ]) {
          addPoint({ x: px, y: py }, matrix);
        }
      }
    }
    return { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
  } finally {
    svg.remove();
  }
}

/**
 * Raster frame (§5.1, §5.2). Without legend: the square frame (crop square plus
 * 5 % margin) at 1080 × scale px. With legend: the page shape of its layout –
 * A4 (same width, extended downwards for bottom and upwards for top) or 16:9
 * (the layout's viewBox).
 * @param {number} scale 1, 2 or 4
 * @param {object|null} layout pie.js legendLayout() of a -legend file
 * @returns {{ x, y, width, height, pxWidth, pxHeight }} viewBox in user units and size in px
 */
export function rasterFrame(scale = 1, layout = null) {
  const square = squareFrame();
  const unitsPerPx = square.width / (RASTER_SIDE * scale);
  let { x, y, width, height } = square;
  if (layout?.shape === 'a4') {
    height = width * Math.SQRT2;
    if (layout.position === 'top') y = square.y + square.height - height;
  } else if (layout?.shape === 'wide') {
    ({ x, y, width, height } = layout.viewBox);
  }
  const pxWidth = Math.round(width / unitsPerPx);
  const pxHeight = Math.round(height / unitsPerPx);
  return { x, y, width: pxWidth * unitsPerPx, height: pxHeight * unitsPerPx, pxWidth, pxHeight };
}

// SVG text ready for rasterising: framed and with embedded fonts.
export async function rasterSvg(svgText, frame) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  embedFonts(doc, await fontCss());
  const root = doc.documentElement;
  root.setAttribute(
    'viewBox',
    [frame.x, frame.y, frame.width, frame.height].map((v) => v.toFixed(3)).join(' '),
  );
  root.setAttribute('width', `${frame.pxWidth}px`);
  root.setAttribute('height', `${frame.pxHeight}px`);
  return serializeElement(doc.documentElement);
}

// --- Rendering ------------------------------------------------------------------

async function loadImage(url) {
  const img = new Image();
  img.decoding = 'sync';
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Render an output SVG as PNG or JPG (§5.1).
 * @param {string} svgText output SVG from pie.js
 * @param {object} options
 * @param {'png'|'jpg'} options.format
 * @param {number} [options.scale] 1, 2 or 4
 * @param {object|null} [options.layout] the file's legend layout (pie.js), for -legend files
 * @returns {Promise<Blob>}
 */
export async function renderRaster(svgText, { format, scale = 1, layout = null }) {
  const type = FORMATS[format];
  if (!type) throw new Error(`renderRaster: unknown format "${format}".`);
  if (!RASTER_SCALES.includes(scale)) throw new Error(`renderRaster: unknown scale ${scale}.`);
  const frame = rasterFrame(scale, layout);
  const svg = await rasterSvg(svgText, frame);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = frame.pxWidth;
    canvas.height = frame.pxHeight;
    const context = canvas.getContext('2d');
    if (format === 'jpg') {
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error('renderRaster: the browser could not encode the image.')),
        type.mime,
        JPEG_QUALITY,
      ),
    );
    // Release the canvas memory right away (matters at ×4).
    canvas.width = 0;
    canvas.height = 0;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const withDpi = format === 'png' ? setPngDpi(bytes, DPI) : setJpegDpi(bytes, DPI);
    return new Blob([withDpi], { type: type.mime });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- DPI metadata ---------------------------------------------------------------

let crcTable = null;

export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function isPng(bytes) {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

// PNG chunks as [{ type, start, end }] (start/end cover the whole chunk).
function pngChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    chunks.push({ type, start: offset, end });
    offset = end;
  }
  return chunks;
}

// Write a pHYs chunk (pixels per metre) right after IHDR, replacing any existing one.
export function setPngDpi(bytes, dpi) {
  if (!isPng(bytes)) throw new Error('setPngDpi: not a PNG file.');
  const ppm = Math.round(dpi * INCHES_PER_METRE);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set(
    [...'pHYs'].map((c) => c.charCodeAt(0)),
    4,
  );
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const chunks = pngChunks(bytes).filter((c) => c.type !== 'pHYs');
  if (chunks[0]?.type !== 'IHDR') throw new Error('setPngDpi: PNG does not start with IHDR.');
  const parts = [
    bytes.subarray(0, PNG_SIGNATURE.length),
    bytes.subarray(chunks[0].start, chunks[0].end),
    chunk,
  ];
  for (const c of chunks.slice(1)) parts.push(bytes.subarray(c.start, c.end));
  return concat(parts);
}

// Read the pHYs chunk: { x, y, unit } or null.
export function readPngDpi(bytes) {
  const chunk = pngChunks(bytes).find((c) => c.type === 'pHYs');
  if (!chunk) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + chunk.start + 8, 9);
  return { x: view.getUint32(0), y: view.getUint32(4), unit: view.getUint8(8) };
}

function isJfif(bytes) {
  return (
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    String.fromCharCode(...bytes.subarray(6, 11)) === 'JFIF\0'
  );
}

// Set the JFIF density to `dpi` dots per inch, inserting a JFIF APP0 segment if missing.
export function setJpegDpi(bytes, dpi) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('setJpegDpi: not a JPEG file.');
  if (isJfif(bytes)) {
    const result = bytes.slice();
    const view = new DataView(result.buffer);
    result[13] = 1; // units: dots per inch
    view.setUint16(14, dpi);
    view.setUint16(16, dpi);
    return result;
  }
  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    dpi >> 8,
    dpi & 0xff,
    dpi >> 8,
    dpi & 0xff,
    0x00,
    0x00,
  ]);
  return concat([bytes.subarray(0, 2), app0, bytes.subarray(2)]);
}

// Read the JFIF density: { x, y, unit } or null.
export function readJpegDpi(bytes) {
  if (!isJfif(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return { x: view.getUint16(14), y: view.getUint16(16), unit: bytes[13] };
}

function concat(parts) {
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

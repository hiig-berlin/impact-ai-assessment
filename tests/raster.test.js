import { test, assert, assertClose, assertEqual } from './harness.js';
import { base, file } from './fixture.js';
import { CROP, generateFiles } from '../pie.js';
import {
  crc32,
  measureLegend,
  rasterFrame,
  rasterSvg,
  readJpegDpi,
  readPngDpi,
  renderRaster,
  setJpegDpi,
  setPngDpi,
} from '../raster.js';

const files = generateFiles(base());
const legendBox = await measureLegend(file(files, 'overview-legend.svg').svg);

async function decode(blob) {
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  return { width: canvas.width, height: canvas.height, pixel: (x, y) => [...context.getImageData(x, y, 1, 1).data] };
}

test('raster: square frame with 5 % margin at ×1, ×2, ×4', () => {
  for (const scale of [1, 2, 4]) {
    const frame = rasterFrame(scale);
    assertEqual([frame.pxWidth, frame.pxHeight], [1080 * scale, 1080 * scale]);
    // The crop square is 90 % of the side, centred.
    const pxPerUnit = frame.pxWidth / frame.width;
    assertClose((CROP.x - frame.x) * pxPerUnit, 54 * scale, 1e-6);
    assertClose((CROP.y - frame.y) * pxPerUnit, 54 * scale, 1e-6);
    assertClose(CROP.size * pxPerUnit, 972 * scale, 1e-6);
  }
});

test('raster: legend box is measured tightly below the chart', () => {
  assert(legendBox, 'legend found');
  // The legend sits in the lower right of the A4 page, inside the page.
  assert(legendBox.x > CROP.x && legendBox.x + legendBox.width < 2481, JSON.stringify(legendBox));
  assert(legendBox.y > 2500 && legendBox.y + legendBox.height < 3508, JSON.stringify(legendBox));
});

test('raster: legend frame keeps width and pie position, extends downwards', () => {
  const square = rasterFrame(1);
  const frame = rasterFrame(1, legendBox);
  assertEqual([frame.x, frame.y], [square.x, square.y]);
  assertEqual(frame.pxWidth, 1080);
  const pxPerUnit = frame.pxWidth / frame.width;
  assertClose(frame.pxHeight, Math.round((legendBox.y + legendBox.height - frame.y) * pxPerUnit + 54), 1);
  // A legend sticking out to the right widens the frame by the same margin.
  const wide = rasterFrame(1, { ...legendBox, width: legendBox.width + 1000 });
  assertClose(wide.pxWidth, Math.round((legendBox.x + legendBox.width + 1000 - wide.x) * pxPerUnit + 54), 1);
});

test('raster: fonts are embedded as base64 @font-face (PT Sans 400 and 700)', async () => {
  const svg = await rasterSvg(file(files, 'overview.svg').svg, rasterFrame(1));
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const style = doc.documentElement.firstElementChild;
  assertEqual(style.localName, 'style');
  const css = style.textContent;
  assertEqual((css.match(/@font-face/g) || []).length, 2);
  assert(/font-family:'PT Sans';font-style:normal;font-weight:400;src:url\(data:font\/woff2;base64,d09GMg/.test(css));
  assert(/font-weight:700;src:url\(data:font\/woff2;base64,d09GMg/.test(css));
  assertEqual(doc.documentElement.getAttribute('width'), '1080px');
  // The SVG downloads themselves don't embed the font.
  assert(!files.some((f) => f.svg.includes('@font-face')));
});

test('raster: PNG is transparent, square and 72 dpi', async () => {
  const blob = await renderRaster(file(files, 'clusters/impact.svg').svg, { format: 'png', scale: 1 });
  assertEqual(blob.type, 'image/png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assertEqual(readPngDpi(bytes), { x: 2835, y: 2835, unit: 1 });
  const image = await decode(blob);
  assertEqual([image.width, image.height], [1080, 1080]);
  assertEqual(image.pixel(2, 2)[3], 0, 'transparent corner');
  // Impact wedge area (upper right of the centre) is drawn.
  assertEqual(image.pixel(620, 300)[3], 255, 'opaque wedge');
});

test('raster: JPG is white, legend files extended, 72 dpi', async () => {
  const blob = await renderRaster(file(files, 'overview-scores-legend.svg').svg, {
    format: 'jpg',
    scale: 1,
    legendBox,
  });
  assertEqual(blob.type, 'image/jpeg');
  assertEqual(readJpegDpi(new Uint8Array(await blob.arrayBuffer())), { x: 72, y: 72, unit: 1 });
  const image = await decode(blob);
  assertEqual(image.width, 1080);
  assert(image.height > 1080, `height ${image.height}`);
  assert(image.pixel(2, 2).slice(0, 3).every((v) => v > 250), 'white corner');
});

test('raster: ×2 doubles the side', async () => {
  const blob = await renderRaster(file(files, 'slices/01-objective-realisation.svg').svg, { format: 'png', scale: 2 });
  const image = await decode(blob);
  assertEqual([image.width, image.height], [2160, 2160]);
});

test('raster: PNG pHYs chunk replaces an existing one; CRC is valid', () => {
  assertEqual(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  // Minimal PNG: signature, IHDR, pHYs (300 dpi), IEND.
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const phys = new Uint8Array(9);
  new DataView(phys.buffer).setUint32(0, 11811);
  new DataView(phys.buffer).setUint32(4, 11811);
  phys[8] = 1;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', new Uint8Array(13)), chunk('pHYs', phys), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  const result = setPngDpi(png, 72);
  assertEqual(result.length, png.length);
  assertEqual(readPngDpi(result), { x: 2835, y: 2835, unit: 1 });
  const crcOffset = 8 + 25 + 8 + 9;
  assertEqual(new DataView(result.buffer).getUint32(crcOffset), crc32(result.subarray(8 + 25 + 4, crcOffset)));
});

test('raster: JPEG without JFIF gets an APP0 segment', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
  const result = setJpegDpi(jpeg, 72);
  assertEqual(readJpegDpi(result), { x: 72, y: 72, unit: 1 });
  assertEqual([...result.subarray(20)], [0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
});

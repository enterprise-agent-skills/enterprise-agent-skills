import { deflateSync, inflateSync } from "node:zlib";
import { crc32 } from "./zip.mjs";

/**
 * Minimal PNG encoder and decoder (no dependencies) for generated icons. Images are 8-bit RGBA.
 * The encoder uses filter type 0 on every row and a fixed compression level, so the same image
 * always produces the same bytes.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A transparent RGBA image. `data` holds 4 bytes per pixel, row by row. */
export function createImage(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("Image size must be positive integers.");
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

/**
 * Fill a rectangle with rounded corners. `color` is [r, g, b, a] with 0 to 255 values. Edges are
 * anti-aliased by sampling each pixel `samples` times per axis, and the color is composited over
 * what the pixel already holds (the "over" operator on straight alpha).
 */
export function fillRoundedRect(image, { x, y, width, height, radius = 0, color }, samples = 4) {
  const r = Math.min(radius, width / 2, height / 2);
  const inside = (px, py) => {
    if (px < x || px > x + width || py < y || py > y + height) return false;
    const cx = px < x + r ? x + r : px > x + width - r ? x + width - r : px;
    const cy = py < y + r ? y + r : py > y + height - r ? y + height - r : py;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(image.width - 1, Math.ceil(x + width));
  const y1 = Math.min(image.height - 1, Math.ceil(y + height));
  const total = samples * samples;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      let hits = 0;
      for (let j = 0; j < samples; j++) {
        for (let i = 0; i < samples; i++) {
          if (inside(px + (i + 0.5) / samples, py + (j + 0.5) / samples)) hits++;
        }
      }
      if (!hits) continue;
      const a = (color[3] / 255) * (hits / total);
      const offset = (py * image.width + px) * 4;
      const dstA = image.data[offset + 3] / 255;
      const outA = a + dstA * (1 - a);
      for (let c = 0; c < 3; c++) {
        const value = outA === 0 ? 0 : (color[c] * a + image.data[offset + c] * dstA * (1 - a)) / outA;
        image.data[offset + c] = Math.round(value);
      }
      image.data[offset + 3] = Math.round(outA * 255);
    }
  }
  return image;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/** Encode an image as a PNG file (8-bit RGBA, no interlace). */
export function encodePng(image) {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new Error("Image data does not match its size.");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0; // filter type 0: none
    data.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Decode a PNG written by encodePng (8-bit RGBA, filter type 0, no interlace). Used by tests and
 * checks; it is not a general PNG reader and throws on anything else.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG file.");
  let pos = 8;
  let header = null;
  const idat = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    const crc = buffer.readUInt32BE(pos + 8 + length);
    if (crc32(buffer.subarray(pos + 4, pos + 8 + length)) !== crc) throw new Error(`CRC mismatch in ${type} chunk.`);
    if (type === "IHDR") {
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR chunk.");
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) throw new Error("decodePng reads only 8-bit RGBA images without interlace.");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = header.width * 4;
  const out = Buffer.alloc(stride * header.height);
  for (let row = 0; row < header.height; row++) {
    if (raw[row * (stride + 1)] !== 0) throw new Error("decodePng reads only filter type 0.");
    raw.copy(out, row * stride, row * (stride + 1) + 1, (row + 1) * (stride + 1));
  }
  return { width: header.width, height: header.height, data: out };
}

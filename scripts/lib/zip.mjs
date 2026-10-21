import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Minimal ZIP writer and reader (no dependencies). The writer is deterministic: entries are
 * sorted, every timestamp is the same fixed date, and permissions are fixed, so the same input
 * always produces the same bytes and release checksums are reproducible.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 2026-01-01 00:00:00 in MS-DOS format; the date has no time zone, so it is the same everywhere.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const UTF8_FLAG = 0x0800;
const MADE_BY_UNIX = (3 << 8) | 30;
const FILE_ATTRS = (0o100644 << 16) >>> 0;
const DIR_ATTRS = ((0o40755 << 16) | 0x10) >>> 0;

/**
 * Build a ZIP archive. `files` is a list of { path, data } with forward-slash paths relative to
 * the archive root. Directory entries for every parent folder are added automatically.
 */
export function createZip(files) {
  const entries = new Map();
  for (const f of files) {
    if (!f.path || f.path.startsWith("/") || f.path.split("/").includes("..")) throw new Error(`Unsafe ZIP path: ${f.path}`);
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = `${parts.slice(0, i).join("/")}/`;
      if (!entries.has(dir)) entries.set(dir, null);
    }
    entries.set(f.path, Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
  }
  const names = [...entries.keys()].sort();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const data = entries.get(name);
    const isDir = data === null;
    const raw = isDir ? Buffer.alloc(0) : data;
    const deflated = isDir ? raw : deflateRawSync(raw, { level: 9 });
    const useDeflate = !isDir && deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = isDir ? 0 : crc32(raw);
    const nameBytes = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(MADE_BY_UNIX, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(isDir ? DIR_ATTRS : FILE_ATTRS, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Read a ZIP archive made by createZip (or any non-ZIP64 archive). Returns [{ path, data }]. */
export function readZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file: end of central directory not found.");
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("Corrupt central directory.");
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const csize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const path = buffer.toString("utf8", pos + 46, pos + 46 + nameLen);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const body = buffer.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    if (!path.endsWith("/") && crc32(data) !== crc) throw new Error(`CRC mismatch for ${path}.`);
    out.push({ path, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

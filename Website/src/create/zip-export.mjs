const encoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function bytesFor(value) {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("ZIP entries must contain text or binary data.");
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

function normalizedEntries(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError("A ZIP package needs at least one file.");
  }

  const names = new Set();
  return files.map(({ name, data }) => {
    const safeName = String(name ?? "").replaceAll("\\", "/");
    if (!safeName || safeName.startsWith("/") || safeName.split("/").includes("..")) {
      throw new TypeError(`Unsafe ZIP filename: ${safeName || "(empty)"}`);
    }
    if (names.has(safeName)) throw new TypeError(`Duplicate ZIP filename: ${safeName}`);
    names.add(safeName);
    const nameBytes = encoder.encode(safeName);
    const content = bytesFor(data);
    return {
      content,
      crc: crc32(content),
      nameBytes,
    };
  });
}

/**
 * Builds a standards-compliant, uncompressed ZIP archive. Keeping this tiny
 * writer local makes complete project downloads work offline and avoids
 * sending font artwork to a server.
 */
export function buildStoredZip(files) {
  const entries = normalizedEntries(files);
  const localSize = entries.reduce(
    (total, entry) => total + 30 + entry.nameBytes.length + entry.content.length,
    0,
  );
  const centralSize = entries.reduce(
    (total, entry) => total + 46 + entry.nameBytes.length,
    0,
  );
  const archive = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(archive.buffer);
  const offsets = [];
  let offset = 0;

  for (const entry of entries) {
    offsets.push(offset);
    writeUint32(view, offset, 0x04034b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 0x0800);
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0x0021);
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.content.length);
    writeUint32(view, offset + 22, entry.content.length);
    writeUint16(view, offset + 26, entry.nameBytes.length);
    writeUint16(view, offset + 28, 0);
    archive.set(entry.nameBytes, offset + 30);
    archive.set(entry.content, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.content.length;
  }

  const centralOffset = offset;
  entries.forEach((entry, index) => {
    writeUint32(view, offset, 0x02014b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 20);
    writeUint16(view, offset + 8, 0x0800);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0);
    writeUint16(view, offset + 14, 0x0021);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.content.length);
    writeUint32(view, offset + 24, entry.content.length);
    writeUint16(view, offset + 28, entry.nameBytes.length);
    writeUint16(view, offset + 30, 0);
    writeUint16(view, offset + 32, 0);
    writeUint16(view, offset + 34, 0);
    writeUint16(view, offset + 36, 0);
    writeUint32(view, offset + 38, 0);
    writeUint32(view, offset + 42, offsets[index]);
    archive.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  });

  writeUint32(view, offset, 0x06054b50);
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, entries.length);
  writeUint16(view, offset + 10, entries.length);
  writeUint32(view, offset + 12, centralSize);
  writeUint32(view, offset + 16, centralOffset);
  writeUint16(view, offset + 20, 0);

  return archive;
}

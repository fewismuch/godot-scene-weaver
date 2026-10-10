// ZIP "store" format. PNG files are already compressed, so recompressing them adds little.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function createZip(files) {
  if (files.length > 65535) throw new Error("小图数量超过 ZIP 格式上限 65535 张。");
  const encoder = new TextEncoder();
  const localParts = [], centralParts = [];
  let offset = 0, centralSize = 0;
  for (const { name, data } of files) {
    const filename = encoder.encode(name);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (filename.length > 65535 || bytes.length > 0xffffffff) throw new Error("ZIP 文件过大。");
    const size = 30 + filename.length + bytes.length;
    if (offset + size > 0xffffffff) throw new Error("ZIP 文件超过 4 GB 上限。");
    const checksum = crc32(bytes);

    const local = new Uint8Array(30);
    const entry = new DataView(local.buffer);
    entry.setUint32(0, 0x04034b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 0x0800, true);
    entry.setUint16(8, 0, true);
    entry.setUint16(12, 0x0021, true);
    entry.setUint32(14, checksum, true);
    entry.setUint32(18, bytes.length, true);
    entry.setUint32(22, bytes.length, true);
    entry.setUint16(26, filename.length, true);
    localParts.push(local, filename, bytes);

    const central = new Uint8Array(46);
    const directory = new DataView(central.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x0800, true);
    directory.setUint16(10, 0, true);
    directory.setUint16(14, 0x0021, true);
    directory.setUint32(16, checksum, true);
    directory.setUint32(20, bytes.length, true);
    directory.setUint32(24, bytes.length, true);
    directory.setUint16(28, filename.length, true);
    directory.setUint32(42, offset, true);
    centralParts.push(central, filename);
    centralSize += central.length + filename.length;
    offset += size;
  }
  if (offset + centralSize + 22 > 0xffffffff) throw new Error("ZIP 文件超过 4 GB 上限。");
  const end = new Uint8Array(22);
  const record = new DataView(end.buffer);
  record.setUint32(0, 0x06054b50, true);
  record.setUint16(8, files.length, true);
  record.setUint16(10, files.length, true);
  record.setUint32(12, centralSize, true);
  record.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

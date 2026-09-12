import zlib from "node:zlib";

// CRC32 implementation
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Creates a standard, fully compliant ZIP archive buffer using DEFLATE compression.
 * Zero external dependencies — portable across Windows, Linux, and macOS.
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = Buffer.from(entry.name, "utf8");
    const compressedData = zlib.deflateRawSync(entry.data);
    const uncompressedSize = entry.data.length;
    const compressedSize = compressedData.length;
    const fileCrc = crc32(entry.data);

    // Local file header (30 bytes + filename length)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // Flags (UTF-8)
    localHeader.writeUInt16LE(8, 8);          // Compression method (8 = Deflate)
    localHeader.writeUInt16LE(0, 10);         // Last mod time
    localHeader.writeUInt16LE(0, 12);         // Last mod date
    localHeader.writeUInt32LE(fileCrc, 14);   // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // Central directory file header (46 bytes + filename length)
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8);     // Flags (UTF-8)
    centralHeader.writeUInt16LE(8, 10);         // Compression method (Deflate)
    centralHeader.writeUInt16LE(0, 12);         // Last mod time
    centralHeader.writeUInt16LE(0, 14);         // Last mod date
    centralHeader.writeUInt32LE(fileCrc, 16);   // CRC-32
    centralHeader.writeUInt32LE(compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(filenameBuf.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);         // External file attributes
    centralHeader.writeUInt32LE(offset, 42);    // Relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuf.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);          // Number of this disk
  eocd.writeUInt16LE(0, 6);          // Disk with start of central directory
  eocd.writeUInt16LE(entries.length, 8); // Total entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries in central directory
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central directory
  eocd.writeUInt16LE(0, 20);         // ZIP comment length

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

/**
 * Extracts all files from a standard ZIP archive buffer.
 * Returns a map from filename to uncompressed buffer.
 */
export function extractZipArchive(zipBuf: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();

  // Find End of Central Directory record from the end of the buffer
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: End of Central Directory signature not found");
  }

  const entryCount = zipBuf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = zipBuf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  let cdPtr = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (zipBuf.readUInt32LE(cdPtr) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header signature at offset ${cdPtr}`);
    }

    const compressionMethod = zipBuf.readUInt16LE(cdPtr + 10);
    const compressedSize = zipBuf.readUInt32LE(cdPtr + 20);
    const uncompressedSize = zipBuf.readUInt32LE(cdPtr + 24);
    const fileNameLen = zipBuf.readUInt16LE(cdPtr + 28);
    const extraLen = zipBuf.readUInt16LE(cdPtr + 30);
    const commentLen = zipBuf.readUInt16LE(cdPtr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(cdPtr + 42);

    const fileName = zipBuf.toString("utf8", cdPtr + 46, cdPtr + 46 + fileNameLen);
    cdPtr += 46 + fileNameLen + extraLen + commentLen;

    // Read local file header to find data offset
    if (zipBuf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local Header signature at offset ${localHeaderOffset} for ${fileName}`);
    }
    const localFileNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen;

    const rawData = zipBuf.subarray(dataOffset, dataOffset + compressedSize);
    let extractedData: Buffer;
    if (compressionMethod === 0) {
      extractedData = Buffer.from(rawData);
    } else if (compressionMethod === 8) {
      extractedData = zlib.inflateRawSync(rawData);
    } else {
      throw new Error(`Unsupported compression method ${compressionMethod} for ${fileName}`);
    }

    if (extractedData.length !== uncompressedSize) {
      throw new Error(`Uncompressed size mismatch for ${fileName}: expected ${uncompressedSize}, got ${extractedData.length}`);
    }

    result.set(fileName, extractedData);
  }

  return result;
}

import { safeName } from "../utils/format.js";
import { imageMimeType, isConstrainedDevice } from "../utils/file-types.js";

function uniqueArchiveName(path, occupied) {
  const base = safeName(path.replace(/\\/g, "/").split("/").pop() || "image");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot) : "";
  let candidate = base;
  let index = 2;
  while (occupied.has(candidate.toLowerCase())) candidate = `${stem}_${index++}${extension}`;
  occupied.add(candidate.toLowerCase());
  return candidate;
}

function buildHuffmanTable(lengths) {
  let maxBits = 0;
  for (const length of lengths) {
    if (length > maxBits) maxBits = length;
  }
  const counts = new Uint16Array(maxBits + 1);
  const nextCodes = new Uint16Array(maxBits + 1);
  for (const length of lengths) {
    if (length) counts[length]++;
  }
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + counts[bits - 1]) << 1;
    nextCodes[bits] = code;
  }
  const table = new Uint32Array(1 << maxBits);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol];
    if (!length) continue;
    let current = nextCodes[length]++;
    let reversed = 0;
    for (let i = 0; i < length; i++) {
      reversed = (reversed << 1) | (current & 1);
      current >>>= 1;
    }
    const packed = (length << 16) | symbol;
    const step = 1 << length;
    for (let key = reversed; key < table.length; key += step) table[key] = packed;
  }
  return { table, maxBits };
}

function inflateRawFallback(input, expectedSize) {
  const lengthBases = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const lengthExtras = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const distanceBases = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const distanceExtras = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const output = new Uint8Array(expectedSize);
  let inputOffset = 0;
  let outputOffset = 0;
  let bitBuffer = 0;
  let bitLength = 0;

  function ensureBits(count) {
    while (bitLength < count) {
      if (inputOffset >= input.length) throw new Error("ZIP 压缩数据不完整");
      bitBuffer |= input[inputOffset++] << bitLength;
      bitLength += 8;
    }
  }

  function readBits(count) {
    ensureBits(count);
    const value = bitBuffer & ((1 << count) - 1);
    bitBuffer >>>= count;
    bitLength -= count;
    return value;
  }

  function decodeSymbol(tree) {
    ensureBits(tree.maxBits);
    const packed = tree.table[bitBuffer & ((1 << tree.maxBits) - 1)];
    const usedBits = packed >>> 16;
    if (!usedBits) throw new Error("ZIP 压缩数据已损坏");
    bitBuffer >>>= usedBits;
    bitLength -= usedBits;
    return packed & 0xffff;
  }

  function fixedTrees() {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    const distanceLengths = new Uint8Array(32);
    distanceLengths.fill(5);
    return { literals: buildHuffmanTable(literalLengths), distances: buildHuffmanTable(distanceLengths) };
  }

  function dynamicTrees() {
    const literalCount = readBits(5) + 257;
    const distanceCount = readBits(5) + 1;
    const codeLengthCount = readBits(4) + 4;
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    const codeLengths = new Uint8Array(19);
    for (let i = 0; i < codeLengthCount; i++) codeLengths[order[i]] = readBits(3);
    const codeLengthTree = buildHuffmanTable(codeLengths);
    const lengths = [];
    const total = literalCount + distanceCount;
    while (lengths.length < total) {
      const symbol = decodeSymbol(codeLengthTree);
      if (symbol <= 15) {
        lengths.push(symbol);
      } else if (symbol === 16) {
        const repeat = readBits(2) + 3;
        const previous = lengths[lengths.length - 1];
        for (let i = 0; i < repeat; i++) lengths.push(previous);
      } else if (symbol === 17) {
        const repeat = readBits(3) + 3;
        for (let i = 0; i < repeat; i++) lengths.push(0);
      } else if (symbol === 18) {
        const repeat = readBits(7) + 11;
        for (let i = 0; i < repeat; i++) lengths.push(0);
      }
    }
    return {
      literals: buildHuffmanTable(lengths.slice(0, literalCount)),
      distances: buildHuffmanTable(lengths.slice(literalCount))
    };
  }

  let finalBlock = false;
  while (!finalBlock) {
    finalBlock = Boolean(readBits(1));
    const blockType = readBits(2);
    if (blockType === 0) {
      const paddingBits = bitLength & 7;
      if (paddingBits) readBits(paddingBits);
      bitBuffer = 0;
      bitLength = 0;
      if (inputOffset + 4 > input.length) throw new Error("ZIP 存储块不完整");
      const length = input[inputOffset] | (input[inputOffset + 1] << 8);
      const inverted = input[inputOffset + 2] | (input[inputOffset + 3] << 8);
      inputOffset += 4;
      if ((length ^ 0xffff) !== inverted) throw new Error("ZIP 存储块校验失败");
      if (inputOffset + length > input.length || outputOffset + length > output.length) throw new Error("ZIP 存储块越界");
      output.set(input.subarray(inputOffset, inputOffset + length), outputOffset);
      inputOffset += length;
      outputOffset += length;
      continue;
    }
    if (blockType === 3) throw new Error("ZIP 压缩块类型不受支持");

    const trees = blockType === 1 ? fixedTrees() : dynamicTrees();
    for (;;) {
      const symbol = decodeSymbol(trees.literals);
      if (symbol < 256) {
        if (outputOffset >= output.length) throw new Error("ZIP 解压结果超过预期大小");
        output[outputOffset++] = symbol;
        continue;
      }
      if (symbol === 256) break;
      const lengthIndex = symbol - 257;
      if (lengthIndex < 0 || lengthIndex >= lengthBases.length) throw new Error("ZIP 长度符号无效");
      const copyLength = lengthBases[lengthIndex] + readBits(lengthExtras[lengthIndex]);
      const distanceSymbol = decodeSymbol(trees.distances);
      if (distanceSymbol >= distanceBases.length) throw new Error("ZIP 距离符号无效");
      const distance = distanceBases[distanceSymbol] + readBits(distanceExtras[distanceSymbol]);
      if (distance > outputOffset || outputOffset + copyLength > output.length) throw new Error("ZIP 回溯距离无效");
      for (let i = 0; i < copyLength; i++) output[outputOffset] = output[outputOffset++ - distance];
    }
  }
  return output;
}

async function inflateZipData(compressed, expectedSize) {
  if ("DecompressionStream" in window) {
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      return inflateRawFallback(compressed, expectedSize);
    }
  }
  return inflateRawFallback(compressed, expectedSize);
}

export async function extractImagesFromZip(archive, occupiedNames = []) {
  const mobileLike = isConstrainedDevice();
  const maxArchiveBytes = mobileLike ? 180 * 1024 * 1024 : 500 * 1024 * 1024;
  const maxExpandedBytes = mobileLike ? 300 * 1024 * 1024 : 900 * 1024 * 1024;
  if (archive.size > maxArchiveBytes) throw new Error(`ZIP 体积过大，请控制在 ${Math.round(maxArchiveBytes / 1024 / 1024)}MB 内`);

  const buffer = await archive.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const minEocd = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minEocd; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error("无法识别 ZIP 文件");

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (!entryCount) return { files: [], skipped: 0, found: 0 };
  if (centralOffset + centralSize > bytes.length) throw new Error("ZIP 文件目录已损坏");

  const entries = [];
  const decoder = new TextDecoder("utf-8");
  let cursor = centralOffset;
  let expandedTotal = 0;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP 文件目录不完整");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nextEntry = cursor + 46 + nameLength + extraLength + commentLength;
    if (nextEntry > bytes.length) throw new Error("ZIP 文件目录不完整");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\0/g, "");
    const isImage = /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(name) && !name.endsWith("/");
    if (isImage) {
      expandedTotal += uncompressedSize;
      if (expandedTotal > maxExpandedBytes) throw new Error("解压后的图片总体积过大，请拆分压缩包");
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    }
    cursor = nextEntry;
  }

  const occupied = new Set(occupiedNames.map(name => name.toLowerCase()));
  const files = [];
  let skipped = 0;
  for (const entry of entries) {
    if (entry.flags & 1) {
      skipped++;
      continue;
    }
    if (entry.method !== 0 && entry.method !== 8) {
      skipped++;
      continue;
    }
    if (entry.localOffset + 30 > bytes.length || view.getUint32(entry.localOffset, true) !== 0x04034b50) {
      throw new Error("ZIP 中的图片索引已损坏");
    }
    const localNameLength = view.getUint16(entry.localOffset + 26, true);
    const localExtraLength = view.getUint16(entry.localOffset + 28, true);
    const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.length) throw new Error("ZIP 中的图片数据不完整");
    const compressed = bytes.slice(dataStart, dataEnd);
    const data = entry.method === 0 ? compressed : await inflateZipData(compressed, entry.uncompressedSize);
    if (entry.uncompressedSize && data.byteLength !== entry.uncompressedSize) {
      throw new Error(`图片 ${entry.name} 解压不完整`);
    }
    const name = uniqueArchiveName(entry.name, occupied);
    files.push(new File([data], name, {
      type: imageMimeType(name),
      lastModified: archive.lastModified + files.length + 1
    }));
  }

  return { files, skipped, found: entries.length };
}

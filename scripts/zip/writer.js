import { outputName } from "../utils/format.js";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

export async function makeZip(items, mode) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const usedNames = new Map();
  let localOffset = 0;
  const stamp = dosDateTime();

  for (const item of items) {
    const rawName = outputName(item, mode);
    const duplicateIndex = (usedNames.get(rawName) || 0) + 1;
    usedNames.set(rawName, duplicateIndex);
    const uniqueName = duplicateIndex === 1 ? rawName : rawName.replace(/\.jpg$/i, `_${duplicateIndex}.jpg`);
    const name = encoder.encode(uniqueName);
    const data = new Uint8Array(await item.outputBlob.arrayBuffer());
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034b50);
    write16(lv, 4, 20);
    write16(lv, 6, 0x0800);
    write16(lv, 8, 0);
    write16(lv, 10, stamp.time);
    write16(lv, 12, stamp.date);
    write32(lv, 14, crc);
    write32(lv, 18, data.length);
    write32(lv, 22, data.length);
    write16(lv, 26, name.length);
    write16(lv, 28, 0);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    write32(cv, 0, 0x02014b50);
    write16(cv, 4, 20);
    write16(cv, 6, 20);
    write16(cv, 8, 0x0800);
    write16(cv, 10, 0);
    write16(cv, 12, stamp.time);
    write16(cv, 14, stamp.date);
    write32(cv, 16, crc);
    write32(cv, 20, data.length);
    write32(cv, 24, data.length);
    write16(cv, 28, name.length);
    write16(cv, 30, 0);
    write16(cv, 32, 0);
    write16(cv, 34, 0);
    write16(cv, 36, 0);
    write32(cv, 38, 0);
    write32(cv, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054b50);
  write16(ev, 4, 0);
  write16(ev, 6, 0);
  write16(ev, 8, items.length);
  write16(ev, 10, items.length);
  write32(ev, 12, centralSize);
  write32(ev, 16, localOffset);
  write16(ev, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

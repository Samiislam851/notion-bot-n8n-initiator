// Generates real (tiny) PDF and PNG files for the test scenarios - no dependencies.
import { deflateSync } from 'node:zlib';

const WIN_ANSI = { '€': 0x80, '–': 0x96, '—': 0x97, 'é': 0xe9, '’': 0x92 };
function pdfString(s) {
  const bytes = [];
  for (const ch of s) {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (code === 0x28 || code === 0x29 || code === 0x5c) bytes.push(0x5c);
    bytes.push(code > 255 ? 0x3f : code);
  }
  return Buffer.from(bytes);
}

/** lines starting with '#' are bold headings. Returns a valid single-page PDF. */
export function makePdf(lines) {
  const parts = [Buffer.from('BT\n14 TL\n50 760 Td\n')];
  for (const raw of lines) {
    const bold = raw.startsWith('#');
    parts.push(Buffer.from(`/${bold ? 'F2 13' : 'F1 11'} Tf\n(`), pdfString(raw.replace(/^#/, '')), Buffer.from(') Tj\nT*\n'));
  }
  parts.push(Buffer.from('ET\n'));
  const content = Buffer.concat(parts);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    null,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [];
  let pos = chunks[0].length;
  objects.forEach((o, i) => {
    const body = o === null
      ? Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')])
      : Buffer.from(o);
    const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(pos);
    pos += obj.length;
    chunks.push(obj);
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A grey "photo" with faint lines, ~ like a phone picture of a receipt (no readable text). */
export function makePng(w = 240, h = 360) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const paper = x > 40 && x < 200;
      const line = paper && y % 18 < 2 && x < 60 + ((y * 7) % 130);
      raw[y * (w + 1) + 1 + x] = line ? 60 : paper ? 235 - ((x * y) % 9) : 90 + ((x + y) % 23);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

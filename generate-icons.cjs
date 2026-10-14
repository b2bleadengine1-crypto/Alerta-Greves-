const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPng(width, height, isMaskable = false) {
  // RGBA buffer
  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (rowSize + 1));

  const cx = width / 2;
  const cy = height / 2;
  const rSafe = isMaskable ? width * 0.38 : width * 0.44;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background dark slate-950: #020617
      let r = 2;
      let g = 6;
      let b = 23;
      let a = 255;

      // Dark radial glow in center
      if (dist < rSafe * 1.1) {
        const glowFactor = (1 - dist / (rSafe * 1.1)) * 0.4;
        r = Math.min(255, Math.floor(r + 239 * glowFactor));
        g = Math.min(255, Math.floor(g + 68 * glowFactor));
        b = Math.min(255, Math.floor(b + 68 * glowFactor));
      }

      // Draw stylized strike triangle alert
      const triH = rSafe * 1.3;
      const triTopY = cy - triH * 0.5;
      const triBaseY = cy + triH * 0.45;
      const triW = triH * 0.95;

      if (y >= triTopY && y <= triBaseY) {
        const progressY = (y - triTopY) / (triBaseY - triTopY);
        const halfWidthAtY = (triW / 2) * progressY;
        if (Math.abs(x - cx) <= halfWidthAtY) {
          // Inside triangle
          const isBorder = (Math.abs(x - cx) >= halfWidthAtY - (width * 0.035)) ||
                           (y >= triBaseY - (width * 0.035));
          if (isBorder) {
            // Bright red/amber border
            const t = (y - triTopY) / triH;
            r = Math.floor(244 * (1 - t) + 245 * t);
            g = Math.floor(63 * (1 - t) + 158 * t);
            b = Math.floor(94 * (1 - t) + 11 * t);
          } else {
            // Triangle interior: dark slate 900
            r = 15;
            g = 23;
            b = 42;

            // Exclamation bar inside
            const barW = width * 0.055;
            const barTop = cy - triH * 0.22;
            const barBottom = cy + triH * 0.12;
            if (Math.abs(x - cx) <= barW / 2 && y >= barTop && y <= barBottom) {
              r = 255; g = 255; b = 255;
            }

            // Exclamation dot
            const dotY = cy + triH * 0.24;
            const dotDist = Math.sqrt((x - cx) * (x - cx) + (y - dotY) * (y - dotY));
            if (dotDist <= barW * 0.65) {
              r = 239; g = 68; b = 68;
            }
          }
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG structure
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));

console.log('Successfully generated PWA PNG icons!');

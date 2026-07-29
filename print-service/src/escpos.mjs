import net from "node:net";
import { inflateSync } from "node:zlib";

function readPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Imagem PNG inválida.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error("Chunk PNG truncado.");
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw new Error(`PNG não suportado (largura=${width}, altura=${height}, bits=${bitDepth}, interlace=${interlace}).`);
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`Tipo de cor PNG não suportado: ${colorType}.`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride, 0);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const row = Buffer.from(raw.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Filtro PNG não suportado: ${filter}.`);
    }
    row.copy(pixels, y * stride);
    previous = row;
  }

  return { width, height, channels, pixels };
}

export function effectiveRasterThreshold(profile) {
  if (profile.useAdvancedThreshold) return Math.max(1, Math.min(254, Number(profile.rasterThreshold) || 168));
  const intensity = Math.max(0, Math.min(100, Number(profile.intensity) || 55));
  return Math.round(105 + intensity * 1.25);
}

export function pngToEscPosRaster(pngBuffer, profile) {
  const png = readPng(pngBuffer);
  const width = Math.min(png.width, Number(profile.dotsPerLine) || png.width);
  const height = png.height;
  const widthBytes = Math.ceil(width / 8);
  const raster = Buffer.alloc(widthBytes * height, 0);
  const threshold = effectiveRasterThreshold(profile);
  let lastBlackRow = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * png.width + x) * png.channels;
      let red;
      let green;
      let blue;
      let alpha = 1;
      if (png.channels === 1) {
        red = green = blue = png.pixels[source];
      } else {
        red = png.pixels[source];
        green = png.pixels[source + 1];
        blue = png.pixels[source + 2];
        if (png.channels === 4) alpha = png.pixels[source + 3] / 255;
      }
      red = red * alpha + 255 * (1 - alpha);
      green = green * alpha + 255 * (1 - alpha);
      blue = blue * alpha + 255 * (1 - alpha);
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      if (luminance <= threshold) {
        const target = y * widthBytes + Math.floor(x / 8);
        raster[target] |= 0x80 >> (x % 8);
        lastBlackRow = y;
      }
    }
  }

  const printableHeight = Math.min(height, Math.max(1, lastBlackRow + 9));
  const xLow = widthBytes & 0xff;
  const xHigh = (widthBytes >> 8) & 0xff;
  const initialize = Buffer.from([0x1b, 0x40]);
  const alignCenter = Buffer.from([0x1b, 0x61, 0x01]);
  const alignLeft = Buffer.from([0x1b, 0x61, 0x00]);
  const feed = Buffer.from(Array(Math.max(0, Number(profile.feedLines) || 0)).fill(0x0a));
  const cut = profile.cutAfterPrint ? Buffer.from([0x1d, 0x56, 0x00]) : Buffer.alloc(0);
  const chunks = [initialize, alignCenter];
  const bandRows = 512;
  for (let startRow = 0; startRow < printableHeight; startRow += bandRows) {
    const rows = Math.min(bandRows, printableHeight - startRow);
    const yLow = rows & 0xff;
    const yHigh = (rows >> 8) & 0xff;
    chunks.push(
      Buffer.from([0x1d, 0x76, 0x30, 0x00, xLow, xHigh, yLow, yHigh]),
      raster.subarray(startRow * widthBytes, (startRow + rows) * widthBytes),
    );
  }
  chunks.push(alignLeft, feed, cut);
  return Buffer.concat(chunks);
}

export async function sendEscPosTcp(buffer, profile, timeoutMs = 15_000) {
  const host = String(profile.networkHost || "").trim();
  const port = Number(profile.networkPort) || 9100;
  if (!host) throw new Error("IP/host da impressora TCP não foi configurado.");

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs, () => finish(new Error(`Tempo esgotado ao conectar em ${host}:${port}.`)));
    socket.once("error", (error) => finish(new Error(`Falha TCP em ${host}:${port}: ${error.message}`)));
    socket.once("connect", () => {
      socket.write(buffer, (error) => {
        if (error) {
          finish(new Error(`Falha ao enviar dados para ${host}:${port}: ${error.message}`));
          return;
        }
        socket.end();
      });
    });
    socket.once("close", (hadError) => {
      if (!hadError) finish();
    });
  });
}

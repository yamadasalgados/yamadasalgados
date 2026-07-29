/**
 * Small dependency-free QR encoder for receipt links.
 * Byte mode, error correction level L, versions 1–10.
 */

type VersionInfo = {
  totalCodewords: number;
  eccCodewordsPerBlock: number;
  blocks: number;
  alignment: number[];
};

const VERSION_INFO: VersionInfo[] = [
  { totalCodewords: 26, eccCodewordsPerBlock: 7, blocks: 1, alignment: [] },
  { totalCodewords: 44, eccCodewordsPerBlock: 10, blocks: 1, alignment: [6, 18] },
  { totalCodewords: 70, eccCodewordsPerBlock: 15, blocks: 1, alignment: [6, 22] },
  { totalCodewords: 100, eccCodewordsPerBlock: 20, blocks: 1, alignment: [6, 26] },
  { totalCodewords: 134, eccCodewordsPerBlock: 26, blocks: 1, alignment: [6, 30] },
  { totalCodewords: 172, eccCodewordsPerBlock: 18, blocks: 2, alignment: [6, 34] },
  { totalCodewords: 196, eccCodewordsPerBlock: 20, blocks: 2, alignment: [6, 22, 38] },
  { totalCodewords: 242, eccCodewordsPerBlock: 24, blocks: 2, alignment: [6, 24, 42] },
  { totalCodewords: 292, eccCodewordsPerBlock: 30, blocks: 2, alignment: [6, 26, 46] },
  { totalCodewords: 346, eccCodewordsPerBlock: 18, blocks: 4, alignment: [6, 28, 50] },
];

class BitBuffer {
  readonly bits: number[] = [];

  append(value: number, length: number) {
    if (length < 0 || length > 31 || value >>> length !== 0) {
      throw new Error("QR_BIT_VALUE_OUT_OF_RANGE");
    }
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function dataCodewordCount(version: number): number {
  const info = VERSION_INFO[version - 1];
  return info.totalCodewords - info.eccCodewordsPerBlock * info.blocks;
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= VERSION_INFO.length; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    const required = 4 + countBits + byteLength * 8;
    if (required <= dataCodewordCount(version) * 8) return version;
  }
  throw new Error("QR_DATA_TOO_LONG");
}

function buildDataCodewords(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCodewordCount(version);
  const buffer = new BitBuffer();
  buffer.append(0b0100, 4); // Byte mode
  buffer.append(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) buffer.append(byte, 8);

  const capacityBits = capacity * 8;
  const terminator = Math.min(4, capacityBits - buffer.bits.length);
  buffer.append(0, terminator);
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);

  const result: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | buffer.bits[i + j];
    result.push(byte);
  }

  for (let padIndex = 0; result.length < capacity; padIndex += 1) {
    result.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }
  return result;
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

function addEccAndInterleave(data: number[], version: number): number[] {
  const info = VERSION_INFO[version - 1];
  const dataCount = dataCodewordCount(version);
  const shortDataLength = Math.floor(dataCount / info.blocks);
  const longBlockCount = dataCount % info.blocks;
  const shortBlockCount = info.blocks - longBlockCount;
  const divisor = reedSolomonDivisor(info.eccCodewordsPerBlock);
  const blocks: Array<{ data: number[]; ecc: number[] }> = [];

  let offset = 0;
  for (let block = 0; block < info.blocks; block += 1) {
    const length = shortDataLength + (block >= shortBlockCount ? 1 : 0);
    const blockData = data.slice(offset, offset + length);
    offset += length;
    blocks.push({ data: blockData, ecc: reedSolomonRemainder(blockData, divisor) });
  }

  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }
  for (let i = 0; i < info.eccCodewordsPerBlock; i += 1) {
    for (const block of blocks) result.push(block.ecc[i]);
  }
  return result;
}

function bchRemainder(value: number, polynomial: number): number {
  let result = value;
  const polyDegree = 31 - Math.clz32(polynomial);
  while (result !== 0 && 31 - Math.clz32(result) >= polyDegree) {
    result ^= polynomial << (31 - Math.clz32(result) - polyDegree);
  }
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    default: throw new Error("QR_INVALID_MASK");
  }
}

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  const runPenalty = (line: boolean[]) => {
    let subtotal = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) subtotal += 3 + runLength - 5;
        runColor = line[i];
        runLength = 1;
      }
    }
    if (runLength >= 5) subtotal += 3 + runLength - 5;
    return subtotal;
  };

  for (let y = 0; y < size; y += 1) score += runPenalty(modules[y]);
  for (let x = 0; x < size; x += 1) {
    score += runPenalty(modules.map((row) => row[x]));
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (
        modules[y][x + 1] === color &&
        modules[y + 1][x] === color &&
        modules[y + 1][x + 1] === color
      ) score += 3;
    }
  }

  const patterns = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  const matchesPattern = (line: boolean[], start: number, pattern: boolean[]) =>
    pattern.every((value, index) => line[start + index] === value);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x <= size - 11; x += 1) {
      if (patterns.some((pattern) => matchesPattern(modules[y], x, pattern))) score += 40;
    }
  }
  for (let x = 0; x < size; x += 1) {
    const line = modules.map((row) => row[x]);
    for (let y = 0; y <= size - 11; y += 1) {
      if (patterns.some((pattern) => matchesPattern(line, y, pattern))) score += 40;
    }
  }

  const dark = modules.reduce(
    (total, row) => total + row.reduce((rowTotal, value) => rowTotal + (value ? 1 : 0), 0),
    0,
  );
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

function buildMatrix(codewords: number[], version: number): boolean[][] {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunction = (x: number, y: number, value: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = value;
    isFunction[y][x] = true;
  };

  const drawFinder = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  for (let i = 0; i < size; i += 1) {
    if (!isFunction[6][i]) setFunction(i, 6, i % 2 === 0);
    if (!isFunction[i][6]) setFunction(6, i, i % 2 === 0);
  }

  const align = VERSION_INFO[version - 1].alignment;
  const lastAlignmentIndex = align.length - 1;
  for (let yIndex = 0; yIndex < align.length; yIndex += 1) {
    for (let xIndex = 0; xIndex < align.length; xIndex += 1) {
      const overlapsFinder =
        (xIndex === 0 && yIndex === 0) ||
        (xIndex === 0 && yIndex === lastAlignmentIndex) ||
        (xIndex === lastAlignmentIndex && yIndex === 0);
      if (overlapsFinder) continue;
      const centerX = align[xIndex];
      const centerY = align[yIndex];
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format information areas.
  for (let i = 0; i <= 5; i += 1) setFunction(8, i, false);
  setFunction(8, 7, false);
  setFunction(8, 8, false);
  setFunction(7, 8, false);
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, false);
  for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, false);
  setFunction(8, size - 8, true);

  if (version >= 7) {
    const versionBits = (version << 12) | bchRemainder(version << 12, 0x1f25);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((versionBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (isFunction[y][x]) continue;
        const bit = bitIndex < codewords.length * 8
          ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
          : false;
        modules[y][x] = bit;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  let best: boolean[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => row.slice());
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && maskBit(mask, x, y)) candidate[y][x] = !candidate[y][x];
      }
    }

    // Error correction level L is encoded as 01.
    const formatData = (1 << 3) | mask;
    const formatBits = ((formatData << 10) | bchRemainder(formatData << 10, 0x537)) ^ 0x5412;
    const bit = (index: number) => ((formatBits >>> index) & 1) !== 0;

    for (let i = 0; i <= 5; i += 1) candidate[i][8] = bit(i);
    candidate[7][8] = bit(6);
    candidate[8][8] = bit(7);
    candidate[8][7] = bit(8);
    for (let i = 9; i < 15; i += 1) candidate[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i += 1) candidate[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) candidate[size - 15 + i][8] = bit(i);
    candidate[size - 8][8] = true;

    const score = penaltyScore(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) throw new Error("QR_MATRIX_FAILED");
  return best;
}

export function createQrMatrix(value: string): boolean[][] {
  const bytes = utf8Bytes(value);
  if (bytes.length === 0) throw new Error("QR_DATA_REQUIRED");
  const version = chooseVersion(bytes.length);
  const data = buildDataCodewords(bytes, version);
  return buildMatrix(addEccAndInterleave(data, version), version);
}

export function createQrSvg(value: string, options: { size?: number; margin?: number } = {}): string {
  const modules = createQrMatrix(value);
  const margin = Math.min(16, Math.max(0, Math.round(options.margin ?? 4)));
  const viewSize = modules.length + margin * 2;
  const requestedSize = Math.min(1024, Math.max(64, Math.round(options.size ?? 256)));
  const path: string[] = [];

  for (let y = 0; y < modules.length; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= modules.length; x += 1) {
      const dark = x < modules.length && modules[y][x];
      if (dark && runStart < 0) runStart = x;
      if ((!dark || x === modules.length) && runStart >= 0) {
        path.push(`M${runStart + margin},${y + margin}h${x - runStart}v1h-${x - runStart}z`);
        runStart = -1;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${requestedSize}" height="${requestedSize}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join("")}" fill="#000"/></svg>`;
}

export function qrByteLength(value: string): number {
  return utf8Bytes(value).length;
}

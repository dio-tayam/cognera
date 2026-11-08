const maxBytes = 5_000_000
const maxEdge = 8_000

export type SniffedImage = {
  contentType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"
  width: number
  height: number
}

export function sniffImage(bytes: Buffer): SniffedImage {
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new Error("The file must be a PNG, JPEG, GIF, or WebP image under 5 MB.")
  }
  const image = detect(bytes)
  if (!image) throw new Error("The file content is not a supported image.")
  if (image.width > maxEdge || image.height > maxEdge || image.width < 1 || image.height < 1) {
    throw new Error("The image dimensions are outside the supported range.")
  }
  return image
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "image"
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120)
  return cleaned.length > 0 ? cleaned : "image"
}

function detect(bytes: Buffer): SniffedImage | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (bytes.length < 24) return null
    return {
      contentType: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes)
  if (
    bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
    bytes.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    if (bytes.length < 10) return null
    return { contentType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return webpSize(bytes)
  }
  return null
}

function jpegSize(bytes: Buffer): SniffedImage | null {
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1] ?? 0
    const length = bytes.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3 && offset + 9 < bytes.length) {
      return {
        contentType: "image/jpeg",
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      }
    }
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

function webpSize(bytes: Buffer): SniffedImage | null {
  if (bytes.length < 30) return null
  const chunk = bytes.subarray(12, 16).toString("ascii")
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes.readUIntLE(24, 3)
    const height = 1 + bytes.readUIntLE(27, 3)
    return { contentType: "image/webp", width, height }
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      contentType: "image/webp",
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    }
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21)
    return {
      contentType: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }
  return null
}

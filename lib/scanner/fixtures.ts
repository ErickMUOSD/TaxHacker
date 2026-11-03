/**
 * Test-only helpers: synthetic receipt images rendered with sharp from SVG, so the metric tests
 * run on realistic text/line content without committing binary fixtures.
 */
import sharp from "sharp"
import { GrayImage } from "./metrics"

export const FIXTURE_WIDTH = 640
export const FIXTURE_HEIGHT = 900

export function receiptSvg(width = FIXTURE_WIDTH, height = FIXTURE_HEIGHT): string {
  const lines: string[] = []
  const items = ["Coffee beans 1kg", "Oat milk", "Croissant x2", "Sparkling water", "Dark chocolate", "Bagels x6"]
  let y = 150
  for (let i = 0; i < 14; i++) {
    const label = items[i % items.length]
    const price = (3.5 + i * 1.37).toFixed(2)
    lines.push(`<text x="40" y="${y}" font-size="22" font-family="monospace">${label}</text>`)
    lines.push(`<text x="${width - 40}" y="${y}" font-size="22" font-family="monospace" text-anchor="end">${price}</text>`)
    y += 40
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f4f1ea"/>
    <text x="${width / 2}" y="70" font-size="34" font-family="monospace" text-anchor="middle" font-weight="bold">ACME GROCERIES</text>
    <line x1="30" y1="100" x2="${width - 30}" y2="100" stroke="#222" stroke-width="2" stroke-dasharray="8 6"/>
    ${lines.join("\n")}
    <line x1="30" y1="${y}" x2="${width - 30}" y2="${y}" stroke="#222" stroke-width="2"/>
    <text x="40" y="${y + 45}" font-size="30" font-family="monospace" font-weight="bold">TOTAL</text>
    <text x="${width - 40}" y="${y + 45}" font-size="30" font-family="monospace" text-anchor="end" font-weight="bold">87.42</text>
  </svg>`
}

export async function receiptPng(options: { blurSigma?: number } = {}): Promise<Buffer> {
  let image = sharp(Buffer.from(receiptSvg()))
  if (options.blurSigma) image = image.blur(options.blurSigma)
  return image.png().toBuffer()
}

export async function toGray(input: Buffer): Promise<GrayImage> {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error(`expected 1 channel, got ${info.channels}`)
  return { data, width: info.width, height: info.height }
}

export async function toRgba(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

export function solidGray(value: number, width = 64, height = 64): GrayImage {
  return { data: new Uint8Array(width * height).fill(value), width, height }
}

/** Shifts an image `dx` pixels to the right (edge-replicated), simulating hand shake between frames. */
export function shiftRight(img: GrayImage, dx: number): GrayImage {
  const out = new Uint8Array(img.data.length)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = Math.max(0, x - dx)
      out[y * img.width + x] = img.data[y * img.width + sx]
    }
  }
  return { data: out, width: img.width, height: img.height }
}

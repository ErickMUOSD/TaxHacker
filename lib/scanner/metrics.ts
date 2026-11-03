/**
 * Pure image-quality metrics over single-channel luminance buffers.
 * Shared by the scanner Web Worker (live frames) and the server (final photo re-check),
 * so both sides measure exactly the same thing at the same scale.
 */

export type GrayImage = {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

/** RGBA (e.g. canvas ImageData) → luma using BT.601 weights, integer math. */
export function rgbaToGray(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): GrayImage {
  const size = width * height
  const out = new Uint8Array(size)
  for (let i = 0, j = 0; i < size; i++, j += 4) {
    // 0.299 R + 0.587 G + 0.114 B, scaled by 1024
    out[i] = (306 * rgba[j] + 601 * rgba[j + 1] + 117 * rgba[j + 2] + 512) >> 10
  }
  return { data: out, width, height }
}

/**
 * Variance of the Laplacian (kernel [0 1 0; 1 -4 1; 0 1 0]), skipping the 1px border.
 * Classic focus measure: blur removes high frequencies, so the response flattens and variance drops.
 */
export function laplacianVariance(img: GrayImage): number {
  const { data, width, height } = img
  if (width < 3 || height < 3) return 0

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const i = row + x
      const v = data[i - width] + data[i + width] + data[i - 1] + data[i + 1] - 4 * data[i]
      sum += v
      sumSq += v * v
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Mean absolute per-pixel difference between two frames of the same size (0–255). */
export function meanAbsFrameDiff(prev: GrayImage, curr: GrayImage): number {
  if (prev.width !== curr.width || prev.height !== curr.height) return Number.POSITIVE_INFINITY
  const a = prev.data
  const b = curr.data
  const size = a.length
  if (size === 0) return 0
  let total = 0
  for (let i = 0; i < size; i++) {
    const d = a[i] - b[i]
    total += d < 0 ? -d : d
  }
  return total / size
}

export type LightingStats = {
  /** Mean grey level 0–255. */
  meanBrightness: number
  /** Fraction (0–1) of pixels strictly above `overexposedLevel`. */
  overexposedRatio: number
}

export function lightingStats(img: GrayImage, overexposedLevel: number): LightingStats {
  const { data } = img
  const size = data.length
  if (size === 0) return { meanBrightness: 0, overexposedRatio: 0 }
  let total = 0
  let over = 0
  for (let i = 0; i < size; i++) {
    const v = data[i]
    total += v
    if (v > overexposedLevel) over++
  }
  return { meanBrightness: total / size, overexposedRatio: over / size }
}

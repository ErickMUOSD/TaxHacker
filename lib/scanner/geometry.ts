export type Point = { x: number; y: number }

/** Quadrilateral corners ordered top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

/** Orders 4 arbitrary corners as TL, TR, BR, BL (sum / difference heuristic). */
export function orderCorners(points: Point[]): Quad {
  if (points.length !== 4) throw new Error("orderCorners expects exactly 4 points")
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y))
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x))
  const tl = bySum[0]
  const br = bySum[3]
  const tr = byDiff[0]
  const bl = byDiff[3]
  return [tl, tr, br, bl]
}

export function scaleQuad(quad: Quad, sx: number, sy: number = sx): Quad {
  return quad.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad
}

export function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Output size of the rectified document: longest opposite edges, then scaled down
 * (keeping aspect ratio) to fit within maxWidth × maxHeight.
 */
export function quadOutputSize(quad: Quad, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const [tl, tr, br, bl] = quad
  const width = Math.max(distance(tl, tr), distance(bl, br))
  const height = Math.max(distance(tl, bl), distance(tr, br))
  if (width <= 0 || height <= 0) return { width: 1, height: 1 }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Fallback quad when nothing was detected: the frame inset by `insetRatio` on each side. */
export function defaultQuad(width: number, height: number, insetRatio = 0.05): Quad {
  const dx = width * insetRatio
  const dy = height * insetRatio
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ]
}

export function clampQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((p) => ({
    x: Math.min(Math.max(p.x, 0), width),
    y: Math.min(Math.max(p.y, 0), height),
  })) as Quad
}

/**
 * Maps a point from source (video/analysis) coordinates to an element rendered with
 * `object-fit: cover` of size viewW × viewH.
 */
export function coverTransform(srcW: number, srcH: number, viewW: number, viewH: number) {
  const scale = Math.max(viewW / srcW, viewH / srcH)
  const offsetX = (viewW - srcW * scale) / 2
  const offsetY = (viewH - srcH * scale) / 2
  return {
    scale,
    offsetX,
    offsetY,
    toView: (p: Point): Point => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }),
  }
}

/** Same as coverTransform but for `object-fit: contain` (letterboxed preview image). */
export function containTransform(srcW: number, srcH: number, viewW: number, viewH: number) {
  const scale = Math.min(viewW / srcW, viewH / srcH)
  const offsetX = (viewW - srcW * scale) / 2
  const offsetY = (viewH - srcH * scale) / 2
  return {
    scale,
    offsetX,
    offsetY,
    toView: (p: Point): Point => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }),
    toSource: (p: Point): Point => ({ x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale }),
  }
}

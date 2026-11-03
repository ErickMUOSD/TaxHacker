import { scannerConfig } from "@/lib/scanner/config"
import { FrameMetrics } from "@/lib/scanner/evaluate"
import { orderCorners, polygonArea, Quad } from "@/lib/scanner/geometry"
import { GrayImage, laplacianVariance, lightingStats, meanAbsFrameDiff, rgbaToGray } from "@/lib/scanner/metrics"
import { loadOpenCV, OpenCV } from "@/lib/scanner/opencv-loader"
import type { WorkerRequest, WorkerResponse } from "./protocol"

// Minimal worker-scope typing (the project tsconfig uses the DOM lib, not "webworker")
type WorkerScope = {
  postMessage(message: unknown, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}
const ctx = self as unknown as WorkerScope

let cv: OpenCV | null = null
let prevGray: GrayImage | null = null

function reply(message: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer)
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    switch (msg.type) {
      case "init": {
        try {
          cv = (await loadOpenCV()).cv
          reply({ type: "ready", id: msg.id, opencv: true })
        } catch (error) {
          // Metrics still work without OpenCV; only document detection/warp are lost
          reply({ type: "ready", id: msg.id, opencv: false, error: String(error) })
        }
        break
      }
      case "analyze": {
        const rgba = new Uint8ClampedArray(msg.buffer)
        const gray = rgbaToGray(rgba, msg.width, msg.height)
        const metrics = analyze(gray, msg.track)
        reply({ type: "analyzed", id: msg.id, metrics })
        break
      }
      case "warp": {
        const out = warp(msg.buffer, msg.width, msg.height, msg.quad, msg.outWidth, msg.outHeight)
        reply({ type: "warped", id: msg.id, width: msg.outWidth, height: msg.outHeight, buffer: out }, [out])
        break
      }
      case "reset": {
        prevGray = null
        reply({ type: "reset", id: msg.id })
        break
      }
    }
  } catch (error) {
    reply({ type: "error", id: msg.id, error: error instanceof Error ? error.message : String(error) })
  }
}

function analyze(gray: GrayImage, track: boolean): FrameMetrics {
  const sharpness = laplacianVariance(gray)
  const frameDiff = track && prevGray ? meanAbsFrameDiff(prevGray, gray) : track ? null : 0
  if (track) prevGray = gray
  const { meanBrightness, overexposedRatio } = lightingStats(gray, scannerConfig.lighting.overexposedLevel)
  const quad = cv ? detectDocument(gray) : null
  const areaRatio = quad ? polygonArea(quad) / (gray.width * gray.height) : 0

  return {
    sharpness,
    frameDiff,
    meanBrightness,
    overexposedRatio,
    quad,
    areaRatio,
    analysisWidth: gray.width,
    analysisHeight: gray.height,
  }
}

/** Largest convex 4-point contour: GaussianBlur → Canny → dilate → findContours → approxPolyDP. */
function detectDocument(gray: GrayImage): Quad | null {
  const { document: cfg } = scannerConfig
  const src = new cv.Mat(gray.height, gray.width, cv.CV_8UC1)
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    src.data.set(gray.data)
    cv.GaussianBlur(src, blurred, new cv.Size(cfg.blurKernel, cfg.blurKernel), 0)
    cv.Canny(blurred, edges, cfg.cannyLow, cfg.cannyHigh)
    // Close small gaps in the paper outline so it forms a single contour
    cv.dilate(edges, edges, kernel)
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    // Ignore tiny contours early; the area threshold itself is applied by evaluateFrame
    const minArea = gray.width * gray.height * 0.05
    let best: Quad | null = null
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const approx = new cv.Mat()
      try {
        const area = cv.contourArea(contour)
        if (area < minArea || area <= bestArea) continue
        const perimeter = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, cfg.approxEpsilonRatio * perimeter, true)
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
        const pts = []
        for (let p = 0; p < 4; p++) {
          pts.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] })
        }
        best = orderCorners(pts)
        bestArea = area
      } finally {
        approx.delete()
        contour.delete()
      }
    }
    return best
  } finally {
    src.delete()
    blurred.delete()
    edges.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()
  }
}

function warp(buffer: ArrayBuffer, width: number, height: number, quad: Quad, outW: number, outH: number): ArrayBuffer {
  if (!cv) throw new Error("Document detector not loaded")
  const src = new cv.Mat(height, width, cv.CV_8UC4)
  const dst = new cv.Mat()
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]))
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH])
  let transform: OpenCV = null
  try {
    src.data.set(new Uint8Array(buffer))
    transform = cv.getPerspectiveTransform(srcPts, dstPts)
    cv.warpPerspective(src, dst, transform, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
    // Copy out of the WASM heap before the Mat is freed
    return (dst.data as Uint8Array).slice().buffer
  } finally {
    src.delete()
    dst.delete()
    srcPts.delete()
    dstPts.delete()
    transform?.delete()
  }
}

import { scannerConfig, ScannerConfig } from "./config"
import { Quad } from "./geometry"

export type FrameMetrics = {
  sharpness: number
  /** Mean abs diff vs previous frame; null for the first frame. */
  frameDiff: number | null
  meanBrightness: number
  overexposedRatio: number
  /** Detected document corners in analysis coordinates, or null. */
  quad: Quad | null
  /** Area of `quad` / frame area (0–1). 0 when no quad. */
  areaRatio: number
  analysisWidth: number
  analysisHeight: number
}

export type DeviceMotionSample = {
  /** Mean acceleration magnitude without gravity (m/s²). */
  accel: number
  /** Mean rotation rate magnitude (deg/s). */
  rotation: number
}

export type FrameIssue = "motion" | "no_document" | "too_far" | "too_dark" | "glare" | "blurry"

export type FrameEvaluation = {
  ok: boolean
  /** Highest-priority failing check, or null when everything passes. */
  issue: FrameIssue | null
}

type EvalConfig = Pick<ScannerConfig, "sharpness" | "motion" | "document" | "lighting">

/**
 * Decides whether a frame is good enough to capture. The order of checks is the order
 * in which the user should fix things: stop moving → find the doc → get closer → light → focus.
 */
export function evaluateFrame(
  metrics: FrameMetrics,
  motion: DeviceMotionSample | null,
  cfg: EvalConfig = scannerConfig
): FrameEvaluation {
  const fail = (issue: FrameIssue): FrameEvaluation => ({ ok: false, issue })

  const deviceMoving =
    motion !== null && (motion.accel > cfg.motion.maxDeviceAccel || motion.rotation > cfg.motion.maxRotationRate)
  const frameMoving = metrics.frameDiff === null || metrics.frameDiff > cfg.motion.maxFrameDiff
  if (deviceMoving || frameMoving) return fail("motion")

  if (!metrics.quad) return fail("no_document")
  if (metrics.areaRatio < cfg.document.minAreaRatio) return fail("too_far")

  if (metrics.meanBrightness < cfg.lighting.minMeanBrightness) return fail("too_dark")
  if (
    metrics.overexposedRatio > cfg.lighting.maxOverexposedRatio ||
    metrics.meanBrightness > cfg.lighting.maxMeanBrightness
  ) {
    return fail("glare")
  }

  if (metrics.sharpness < cfg.sharpness.minVariance) return fail("blurry")

  return { ok: true, issue: null }
}

/**
 * Tracks how long the "ok" condition has held. `update` returns true exactly once,
 * when it has been ok for at least `stableMs`; any failing frame resets the timer.
 */
export function createStabilityTracker(stableMs: number) {
  let okSince: number | null = null
  let fired = false
  return {
    update(ok: boolean, now: number): boolean {
      if (!ok) {
        okSince = null
        fired = false
        return false
      }
      if (okSince === null) okSince = now
      if (!fired && now - okSince >= stableMs) {
        fired = true
        return true
      }
      return false
    },
    /** 0–1 progress towards auto-capture, for UI feedback. */
    progress(now: number): number {
      if (okSince === null) return 0
      return Math.min(1, (now - okSince) / stableMs)
    },
    reset() {
      okSince = null
      fired = false
    },
  }
}

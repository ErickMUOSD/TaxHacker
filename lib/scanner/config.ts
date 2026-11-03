/**
 * Camera scanner thresholds — the single place to tune the guided capture.
 *
 * Imported by the browser (UI + Web Worker) and by the server (sharpness re-check),
 * so it must stay free of Node-only imports.
 *
 * Calibrate with `?scanDebug=1` on any app page: the camera view then shows the live
 * values next to each threshold. See README section "Camera scanner" for the procedure.
 */
export const scannerConfig = {
  /** Width (px) of the downscaled greyscale copy every metric is computed on. Height keeps aspect ratio. */
  analysisWidth: 640,

  sharpness: {
    /**
     * Minimum variance of the Laplacian (4-neighbour kernel) at `analysisWidth`.
     * Higher = sharper. Sharp printed receipts usually land at 300–2000, motion/defocus blur under 100.
     */
    minVariance: 120,
    /**
     * Server-side minimum, measured the same way on the uploaded camera photo before calling the LLM.
     * Keep it a bit below `minVariance`: the final photo is perspective-corrected and JPEG-compressed,
     * which slightly lowers the score, and we don't want to reject what the phone accepted.
     */
    serverMinVariance: 90,
  },

  motion: {
    /** Max mean absolute difference (0–255) between two consecutive analysis frames. */
    maxFrameDiff: 6,
    /** Max device acceleration without gravity (m/s²), averaged over `windowMs`. Ignored if unavailable. */
    maxDeviceAccel: 0.6,
    /** Max rotation rate magnitude (deg/s), averaged over `windowMs`. Ignored if unavailable. */
    maxRotationRate: 25,
    /** Sliding window (ms) used to average DeviceMotionEvent samples. */
    windowMs: 250,
  },

  document: {
    /** Detected quadrilateral must cover at least this fraction of the frame (0–1). */
    minAreaRatio: 0.35,
    /** Gaussian blur kernel (odd) applied before Canny to remove paper texture noise. */
    blurKernel: 5,
    /** Canny hysteresis thresholds. */
    cannyLow: 50,
    cannyHigh: 150,
    /** approxPolyDP epsilon as a fraction of the contour perimeter. */
    approxEpsilonRatio: 0.02,
  },

  lighting: {
    /** Grey level above which a pixel counts as blown out (glare). */
    overexposedLevel: 250,
    /** Max fraction of blown-out pixels (0–1) before warning about glare. */
    maxOverexposedRatio: 0.02,
    /** Mean grey level below which the scene is too dark. */
    minMeanBrightness: 60,
    /** Mean grey level above which the scene is washed out (counts as glare). A white receipt filling the frame is ~235. */
    maxMeanBrightness: 245,
  },

  autoCapture: {
    /** All checks must pass continuously for this long (ms) to auto-capture. */
    stableMs: 400,
    /** Haptic confirmation length (ms) via navigator.vibrate. 0 disables it. */
    vibrateMs: 50,
  },

  output: {
    /**
     * Full-resolution captures (ImageCapture can return 12–50 MP) are downscaled so their longest
     * side is at most this before cropping. Keeps memory bounded on phones (iOS canvas limit ~16 MP).
     */
    maxSourceSide: 3200,
    /** Max size of the perspective-corrected image sent to the upload pipeline. */
    maxWidth: 2400,
    maxHeight: 2400,
    /** JPEG quality (0–1) of the final image. */
    jpegQuality: 0.92,
  },

  /** Show live metric values over the camera view. Also enabled with the `?scanDebug=1` query param. */
  debug: false,
} as const

export type ScannerConfig = typeof scannerConfig

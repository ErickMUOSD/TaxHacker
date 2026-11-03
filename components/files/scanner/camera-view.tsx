"use client"

import { Button } from "@/components/ui/button"
import { scannerConfig } from "@/lib/scanner/config"
import { createStabilityTracker, evaluateFrame, FrameEvaluation, FrameMetrics } from "@/lib/scanner/evaluate"
import { coverTransform } from "@/lib/scanner/geometry"
import { issueMessage, scannerMessages } from "@/lib/scanner/messages"
import { cn } from "@/lib/utils"
import { Camera, Flashlight, FlashlightOff, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { useCamera } from "./use-camera"
import type { useDeviceMotion } from "./use-device-motion"
import type { ScannerWorkerApi } from "./use-scanner-worker"

const COLOR_OK = "#22c55e" // tailwind green-500
const COLOR_WARN = "#f59e0b" // tailwind amber-500

type CameraApi = ReturnType<typeof useCamera>
type Motion = ReturnType<typeof useDeviceMotion>

type LiveState = { metrics: FrameMetrics; evaluation: FrameEvaluation; progress: number }

export function CameraView({
  camera,
  worker,
  workerStatus,
  motion,
  debug,
  onCapture,
  onClose,
}: {
  camera: CameraApi
  worker: ScannerWorkerApi
  workerStatus: "idle" | "loading" | "ready" | "no-opencv"
  motion: Motion
  debug: boolean
  onCapture: (photo: HTMLCanvasElement) => Promise<void>
  onClose: () => void
}) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const capturingRef = useRef(false)
  const [capturing, setCapturing] = useState(false)
  const [live, setLive] = useState<LiveState | null>(null)
  const { state, videoRef, attachVideo, setTorch, takeFullResPhoto } = camera
  const readMotion = motion.read
  const isLive = state.status === "live"

  const capture = useCallback(async () => {
    if (capturingRef.current) return
    capturingRef.current = true
    setCapturing(true)
    try {
      if (scannerConfig.autoCapture.vibrateMs > 0) navigator.vibrate?.(scannerConfig.autoCapture.vibrateMs)
      const photo = await takeFullResPhoto()
      await onCapture(photo)
    } catch (error) {
      console.error("Capture failed:", error)
    } finally {
      capturingRef.current = false
      setCapturing(false)
    }
  }, [takeFullResPhoto, onCapture])

  // The analysis loop calls the latest capture() without restarting when its identity changes
  const captureRef = useRef(capture)
  useEffect(() => {
    captureRef.current = capture
  }, [capture])

  // Analysis loop: one frame in flight at a time (frames arriving while the worker is busy are skipped)
  useEffect(() => {
    if (!isLive) return
    const video = videoRef.current
    if (!video) return

    let stopped = false
    let busy = false
    const tracker = createStabilityTracker(scannerConfig.autoCapture.stableMs)
    const analysisCanvas = document.createElement("canvas")
    const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true })
    if (!analysisCtx) return
    worker.reset().catch(() => {})

    const drawOverlay = (metrics: FrameMetrics, ok: boolean) => {
      const overlay = overlayRef.current
      if (!overlay) return
      const rect = overlay.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (overlay.width !== Math.round(rect.width * dpr)) overlay.width = Math.round(rect.width * dpr)
      if (overlay.height !== Math.round(rect.height * dpr)) overlay.height = Math.round(rect.height * dpr)
      const ctx = overlay.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      if (!metrics.quad) return
      const t = coverTransform(metrics.analysisWidth, metrics.analysisHeight, rect.width, rect.height)
      const pts = metrics.quad.map(t.toView)
      const color = ok ? COLOR_OK : COLOR_WARN
      ctx.beginPath()
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.lineWidth = 4
      ctx.strokeStyle = color
      ctx.fillStyle = ok ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.12)"
      ctx.fill()
      ctx.stroke()
    }

    const step = async () => {
      if (busy || capturingRef.current || video.readyState < 2 || !video.videoWidth) return
      busy = true
      try {
        const width = scannerConfig.analysisWidth
        const height = Math.round((video.videoHeight / video.videoWidth) * width)
        if (analysisCanvas.width !== width) analysisCanvas.width = width
        if (analysisCanvas.height !== height) analysisCanvas.height = height
        analysisCtx.drawImage(video, 0, 0, width, height)
        const frame = analysisCtx.getImageData(0, 0, width, height)
        const metrics = await worker.analyze(frame, true)
        if (stopped) return
        const evaluation = evaluateFrame(metrics, readMotion())
        const now = performance.now()
        const shouldCapture = tracker.update(evaluation.ok, now)
        drawOverlay(metrics, evaluation.ok)
        setLive({ metrics, evaluation, progress: tracker.progress(now) })
        if (shouldCapture) captureRef.current()
      } catch (error) {
        if (!stopped) console.warn("Frame analysis failed:", error)
      } finally {
        busy = false
      }
    }

    // Prefer requestVideoFrameCallback (fires per decoded frame); fall back to rAF
    type RVFCVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    const rvfcVideo = video as RVFCVideo
    let handle = 0
    const schedule = () => {
      if (stopped) return
      if (rvfcVideo.requestVideoFrameCallback) handle = rvfcVideo.requestVideoFrameCallback(loop)
      else handle = requestAnimationFrame(loop)
    }
    const loop = () => {
      step()
      schedule()
    }
    schedule()

    return () => {
      stopped = true
      if (rvfcVideo.cancelVideoFrameCallback) rvfcVideo.cancelVideoFrameCallback(handle)
      else cancelAnimationFrame(handle)
    }
  }, [isLive, videoRef, worker, readMotion])

  const message =
    state.status !== "live"
      ? scannerMessages.starting
      : workerStatus === "loading"
        ? scannerMessages.loadingDetector
        : live
          ? issueMessage(live.evaluation.issue)
          : scannerMessages.starting
  const ok = live?.evaluation.ok ?? false

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video ref={attachVideo} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full bg-black/50 text-white hover:bg-black/70"
          onClick={onClose}
          aria-label={scannerMessages.close}
        >
          <X className="h-5 w-5" />
        </Button>
        {state.status === "live" && state.torchAvailable && (
          <Button
            variant="secondary"
            size="icon"
            className={cn(
              "rounded-full text-white hover:bg-black/70",
              state.torchOn ? "bg-amber-500/80" : "bg-black/50"
            )}
            onClick={() => setTorch(!state.torchOn)}
            aria-label={state.torchOn ? scannerMessages.torchOff : scannerMessages.torchOn}
          >
            {state.torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </Button>
        )}
      </div>

      <div className="absolute inset-x-0 top-20 flex justify-center px-4">
        <div
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors",
            ok ? "bg-green-600/90" : "bg-black/60"
          )}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      </div>

      {debug && live && <DebugPanel live={live} workerStatus={workerStatus} motion={readMotion()} />}

      <div className="absolute inset-x-0 bottom-0 flex justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={capture}
          disabled={!isLive || capturing}
          aria-label={scannerMessages.capture}
          className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-50"
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden>
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke={COLOR_OK}
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 36}
              strokeDashoffset={2 * Math.PI * 36 * (1 - (live?.progress ?? 0))}
            />
          </svg>
          {capturing ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : (
            <Camera className="h-8 w-8 text-white" />
          )}
        </button>
      </div>
    </div>
  )
}

function DebugPanel({
  live,
  workerStatus,
  motion,
}: {
  live: LiveState
  workerStatus: string
  motion: { accel: number; rotation: number } | null
}) {
  const { metrics: m } = live
  const c = scannerConfig
  const row = (label: string, value: string, limit: string, pass: boolean) => (
    <div className={pass ? "text-green-300" : "text-amber-300"}>
      {label}: {value} ({limit})
    </div>
  )
  return (
    <div className="absolute left-2 top-32 rounded bg-black/70 p-2 font-mono text-[11px] leading-tight text-white">
      <div>detector: {workerStatus}</div>
      {row("sharpness", m.sharpness.toFixed(0), `≥${c.sharpness.minVariance}`, m.sharpness >= c.sharpness.minVariance)}
      {row(
        "frameDiff",
        m.frameDiff === null ? "–" : m.frameDiff.toFixed(2),
        `≤${c.motion.maxFrameDiff}`,
        m.frameDiff !== null && m.frameDiff <= c.motion.maxFrameDiff
      )}
      {motion &&
        row(
          "accel/rot",
          `${motion.accel.toFixed(2)}/${motion.rotation.toFixed(0)}`,
          `≤${c.motion.maxDeviceAccel}/${c.motion.maxRotationRate}`,
          motion.accel <= c.motion.maxDeviceAccel && motion.rotation <= c.motion.maxRotationRate
        )}
      {row("area", m.areaRatio.toFixed(2), `≥${c.document.minAreaRatio}`, m.areaRatio >= c.document.minAreaRatio)}
      {row(
        "brightness",
        m.meanBrightness.toFixed(0),
        `${c.lighting.minMeanBrightness}–${c.lighting.maxMeanBrightness}`,
        m.meanBrightness >= c.lighting.minMeanBrightness && m.meanBrightness <= c.lighting.maxMeanBrightness
      )}
      {row(
        "overexposed",
        (m.overexposedRatio * 100).toFixed(1) + "%",
        `≤${(c.lighting.maxOverexposedRatio * 100).toFixed(1)}%`,
        m.overexposedRatio <= c.lighting.maxOverexposedRatio
      )}
      <div>issue: {live.evaluation.issue ?? "none"}</div>
    </div>
  )
}

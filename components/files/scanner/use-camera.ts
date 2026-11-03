"use client"

import { scannerConfig } from "@/lib/scanner/config"
import { useCallback, useEffect, useRef, useState } from "react"

export type CameraFailure = "noSecureContext" | "unsupported" | "denied" | "generic"

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live"; torchAvailable: boolean; torchOn: boolean }
  | { status: "failed"; reason: CameraFailure }

/** Extra MediaTrack capability/constraint keys not yet in lib.dom (torch, focusMode). */
type ExtendedCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }
type ExtendedConstraintSet = MediaTrackConstraintSet & { torch?: boolean; focusMode?: string }

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> }

export function cameraSupport(): CameraFailure | null {
  if (typeof window === "undefined") return "unsupported"
  if (!window.isSecureContext) return "noSecureContext"
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported"
  return null
}

function classifyError(error: unknown): CameraFailure {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") return "denied"
  if (name === "NotFoundError" || name === "NotSupportedError") return "unsupported"
  return "generic"
}

/**
 * Rear camera stream at the highest resolution the device offers, with continuous focus and
 * torch when supported. All tracks are stopped when `enabled` turns false or on unmount.
 */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({ status: "idle" })

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const start = async () => {
      const unsupported = cameraSupport()
      if (unsupported) {
        setState({ status: "failed", reason: unsupported })
        return
      }
      setState({ status: "starting" })
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 4096 },
            height: { ideal: 2160 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        const caps = (track.getCapabilities?.() ?? {}) as ExtendedCapabilities

        // Push to the max supported resolution and continuous focus where available
        const advanced: ExtendedConstraintSet[] = []
        if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" })
        const constraints: MediaTrackConstraints = { advanced }
        if (caps.width?.max && caps.height?.max) {
          constraints.width = { ideal: caps.width.max }
          constraints.height = { ideal: caps.height.max }
        }
        await track.applyConstraints(constraints).catch((error) => {
          console.warn("Camera constraints not applied:", error)
        })

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        if (!cancelled) setState({ status: "live", torchAvailable: caps.torch === true, torchOn: false })
      } catch (error) {
        console.error("Camera start failed:", error)
        if (!cancelled) setState({ status: "failed", reason: classifyError(error) })
      }
    }

    start()
    return () => {
      cancelled = true
      stop()
      setState({ status: "idle" })
    }
  }, [enabled, stop])

  const setTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as ExtendedConstraintSet] })
      setState((prev) => (prev.status === "live" ? { ...prev, torchOn: on } : prev))
    } catch (error) {
      console.warn("Torch toggle failed:", error)
    }
  }, [])

  /**
   * Full-resolution still: ImageCapture.takePhoto() where available (Chrome Android),
   * otherwise the current video frame at native resolution (Safari iOS).
   * Downscaled to `output.maxSourceSide` on the longest edge.
   */
  const takeFullResPhoto = useCallback(async (): Promise<HTMLCanvasElement> => {
    const video = videoRef.current
    const track = streamRef.current?.getVideoTracks()[0]
    if (!video || !track) throw new Error("Camera is not running")

    let source: CanvasImageSource = video
    let width = video.videoWidth
    let height = video.videoHeight
    let bitmap: ImageBitmap | null = null

    const ImageCaptureImpl = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture
    if (ImageCaptureImpl) {
      try {
        const blob = await new ImageCaptureImpl(track).takePhoto()
        bitmap = await createImageBitmap(blob)
        source = bitmap
        width = bitmap.width
        height = bitmap.height
      } catch (error) {
        console.warn("takePhoto failed, falling back to video frame:", error)
      }
    }

    const scale = Math.min(1, scannerConfig.output.maxSourceSide / Math.max(width, height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D not available")
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    bitmap?.close()
    return canvas
  }, [])

  /** Callback ref for the <video>: attaches the stream even if the element mounts after it started. */
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    if (element && streamRef.current && element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current
      element.play().catch(() => {})
    }
  }, [])

  return { videoRef, attachVideo, state, setTorch, takeFullResPhoto, stop }
}

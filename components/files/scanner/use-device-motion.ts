"use client"

import { scannerConfig } from "@/lib/scanner/config"
import { DeviceMotionSample } from "@/lib/scanner/evaluate"
import { useCallback, useEffect, useRef } from "react"

type IOSDeviceMotionEvent = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">
}

type Sample = { t: number; accel: number; rotation: number }

/**
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from a user gesture.
 * Call this from the "Scan with camera" click handler, before opening the dialog.
 * Resolves to false when motion is unavailable/denied; the scanner then relies on frame diff only.
 */
export async function requestDeviceMotionPermission(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return false
  const ctor = DeviceMotionEvent as IOSDeviceMotionEvent
  if (typeof ctor.requestPermission !== "function") return true
  try {
    return (await ctor.requestPermission()) === "granted"
  } catch {
    return false
  }
}

/** Keeps a sliding window of device motion; `read()` returns its mean, or null if no samples arrived. */
export function useDeviceMotion(enabled: boolean) {
  const samplesRef = useRef<Sample[]>([])

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return
    const samples = samplesRef.current
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.acceleration
      const r = event.rotationRate
      if (!a && !r) return
      const accel = a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : 0
      const rotation = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0
      const t = performance.now()
      samples.push({ t, accel, rotation })
      while (samples.length > 0 && t - samples[0].t > scannerConfig.motion.windowMs) samples.shift()
    }
    window.addEventListener("devicemotion", onMotion)
    return () => {
      window.removeEventListener("devicemotion", onMotion)
      samples.length = 0
    }
  }, [enabled])

  const read = useCallback((): DeviceMotionSample | null => {
    const now = performance.now()
    const samples = samplesRef.current.filter((s) => now - s.t <= scannerConfig.motion.windowMs)
    if (samples.length === 0) return null
    const accel = samples.reduce((acc, s) => acc + s.accel, 0) / samples.length
    const rotation = samples.reduce((acc, s) => acc + s.rotation, 0) / samples.length
    return { accel, rotation }
  }, [])

  return { read }
}

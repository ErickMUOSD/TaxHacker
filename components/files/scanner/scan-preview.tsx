"use client"

import { Button } from "@/components/ui/button"
import { clampQuad, containTransform, Point, Quad } from "@/lib/scanner/geometry"
import { scannerMessages } from "@/lib/scanner/messages"
import { Check, Loader2, RotateCcw } from "lucide-react"
import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react"

const HANDLE_RADIUS = 14

/**
 * Shows the captured photo with the detected document outline. Each corner can be dragged
 * (mouse or touch) to fix a bad detection before cropping.
 */
export function ScanPreview({
  imageUrl,
  imageWidth,
  imageHeight,
  quad,
  onQuadChange,
  canCrop,
  busy,
  busyLabel,
  onRetake,
  onUse,
}: {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  quad: Quad
  onQuadChange: (quad: Quad) => void
  /** False when OpenCV is unavailable: the photo is uploaded uncropped and handles are hidden. */
  canCrop: boolean
  busy: boolean
  busyLabel: string
  onRetake: () => void
  onUse: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const transform = containTransform(imageWidth, imageHeight, size.width || 1, size.height || 1)
  const viewPoints = quad.map(transform.toView)

  const toSourcePoint = (event: ReactPointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect()
    return transform.toSource({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  const onPointerDown = (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    if (busy) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragIndexRef.current = index
  }

  const onPointerMove = (event: ReactPointerEvent<SVGCircleElement>) => {
    const index = dragIndexRef.current
    if (index === null) return
    const next = [...quad] as Quad
    next[index] = toSourcePoint(event)
    onQuadChange(clampQuad(next, imageWidth, imageHeight))
  }

  const onPointerUp = (event: ReactPointerEvent<SVGCircleElement>) => {
    dragIndexRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="flex h-full w-full flex-col bg-black text-white">
      <div className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] text-center">
        <h2 className="text-lg font-semibold">{scannerMessages.preview.title}</h2>
        {canCrop && <p className="text-sm text-white/70">{scannerMessages.preview.hint}</p>}
      </div>

      <div ref={containerRef} className="relative flex-1 touch-none select-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable asset */}
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        {canCrop && size.width > 0 && (
          <svg className="absolute inset-0 h-full w-full">
            <polygon
              points={viewPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(34,197,94,0.15)"
              stroke="#22c55e"
              strokeWidth={3}
            />
            {viewPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={HANDLE_RADIUS}
                fill="rgba(255,255,255,0.9)"
                stroke="#22c55e"
                strokeWidth={3}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={onPointerDown(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="flex gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" className="flex-1" onClick={onRetake} disabled={busy}>
          <RotateCcw className="h-4 w-4" />
          {scannerMessages.preview.retake}
        </Button>
        <Button className="flex-1" onClick={onUse} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {busyLabel}
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              {scannerMessages.preview.usePhoto}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { scannerConfig } from "@/lib/scanner/config"
import { defaultQuad, Quad, quadOutputSize, scaleQuad } from "@/lib/scanner/geometry"
import { scannerMessages } from "@/lib/scanner/messages"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { format } from "date-fns"
import { Camera, CameraOff, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { FormError } from "../../forms/error"
import { CameraView } from "./camera-view"
import { ScanPreview } from "./scan-preview"
import { useCamera } from "./use-camera"
import { useDeviceMotion } from "./use-device-motion"
import { useScannerWorker } from "./use-scanner-worker"

type Photo = { canvas: HTMLCanvasElement; url: string; quad: Quad }

/** Returns null on success or an error message to show. */
export type ScanFileHandler = (file: File) => Promise<string | null>

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))), "image/jpeg", quality)
  })
}

function scanFileName() {
  return `scan-${format(new Date(), "yyyyMMdd-HHmmss")}.jpg`
}

function isDebugEnabled() {
  if (scannerConfig.debug) return true
  try {
    return new URLSearchParams(window.location.search).has("scanDebug")
  } catch {
    return false
  }
}

/**
 * Full-screen guided camera: live quality checks → (auto) capture → crop preview → onFile.
 * Falls back to a native `capture` file input when live camera access is not possible.
 */
export function CameraScanner({
  open,
  onOpenChange,
  onFile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFile: ScanFileHandler
}) {
  const { status: workerStatus, api: worker } = useScannerWorker(open)
  const camera = useCamera(open)
  const motion = useDeviceMotion(open)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [busy, setBusy] = useState<"processing" | "uploading" | null>(null)
  const [error, setError] = useState("")
  // Only read inside the (client-only) dialog, so the initial server value never renders
  const [debug] = useState(() => typeof window !== "undefined" && isDebugEnabled())
  const fallbackInputRef = useRef<HTMLInputElement>(null)

  // Release the preview object URL when it is replaced or the dialog closes
  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.url)
  }, [photo])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPhoto(null)
      setBusy(null)
      setError("")
    }
    onOpenChange(next)
  }

  const handleCapture = useCallback(
    async (canvas: HTMLCanvasElement) => {
      setError("")
      setBusy("processing")
      let quad = defaultQuad(canvas.width, canvas.height)
      try {
        if (workerStatus === "ready") {
          // Re-detect on the actual still (its aspect/resolution may differ from the video stream)
          const width = scannerConfig.analysisWidth
          const height = Math.round((canvas.height / canvas.width) * width)
          const small = document.createElement("canvas")
          small.width = width
          small.height = height
          const ctx = small.getContext("2d", { willReadFrequently: true })!
          ctx.drawImage(canvas, 0, 0, width, height)
          const metrics = await worker.analyze(ctx.getImageData(0, 0, width, height), false)
          if (metrics.quad) quad = scaleQuad(metrics.quad, canvas.width / width, canvas.height / height)
        }
        const blob = await canvasToBlob(canvas, 0.85)
        setPhoto({ canvas, url: URL.createObjectURL(blob), quad })
      } catch (err) {
        console.error("Preparing preview failed:", err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(null)
      }
    },
    [worker, workerStatus]
  )

  const submit = async (file: File) => {
    setBusy("uploading")
    const uploadError = await onFile(file)
    setBusy(null)
    if (uploadError) setError(uploadError)
  }

  const handleUse = async () => {
    if (!photo) return
    setError("")
    setBusy("processing")
    try {
      let output = photo.canvas
      if (workerStatus === "ready") {
        const { canvas } = photo
        const { width, height } = quadOutputSize(photo.quad, scannerConfig.output.maxWidth, scannerConfig.output.maxHeight)
        const source = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
        const warped = await worker.warp(source, photo.quad, width, height)
        output = document.createElement("canvas")
        output.width = warped.width
        output.height = warped.height
        output.getContext("2d")!.putImageData(warped, 0, 0)
      }
      const blob = await canvasToBlob(output, scannerConfig.output.jpegQuality)
      await submit(new File([blob], scanFileName(), { type: "image/jpeg", lastModified: Date.now() }))
    } catch (err) {
      console.error("Processing scan failed:", err)
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  const handleFallbackFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) await submit(file)
  }

  const failed = camera.state.status === "failed" ? camera.state.reason : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col bg-black outline-none"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">{scannerMessages.title}</DialogTitle>
          <DialogDescription className="sr-only">{scannerMessages.preview.hint}</DialogDescription>

          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-white">
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-4 top-4 rounded-full bg-black/50 text-white"
                onClick={() => handleOpenChange(false)}
                aria-label={scannerMessages.close}
              >
                <X className="h-5 w-5" />
              </Button>
              <CameraOff className="h-12 w-12 text-white/70" />
              <h2 className="text-lg font-semibold">{scannerMessages.fallback.title}</h2>
              <p className="max-w-sm text-sm text-white/70">{scannerMessages.fallback[failed]}</p>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFallbackFile}
              />
              <Button onClick={() => fallbackInputRef.current?.click()} disabled={busy !== null}>
                <Camera className="h-4 w-4" />
                {busy === "uploading" ? scannerMessages.preview.uploading : scannerMessages.fallback.action}
              </Button>
            </div>
          ) : photo ? (
            <ScanPreview
              imageUrl={photo.url}
              imageWidth={photo.canvas.width}
              imageHeight={photo.canvas.height}
              quad={photo.quad}
              onQuadChange={(quad) => setPhoto((prev) => (prev ? { ...prev, quad } : prev))}
              canCrop={workerStatus === "ready"}
              busy={busy !== null}
              busyLabel={busy === "uploading" ? scannerMessages.preview.uploading : scannerMessages.preview.processing}
              onRetake={() => {
                setError("")
                setPhoto(null)
              }}
              onUse={handleUse}
            />
          ) : (
            <CameraView
              camera={camera}
              worker={worker}
              workerStatus={workerStatus}
              motion={motion}
              debug={debug}
              onCapture={handleCapture}
              onClose={() => handleOpenChange(false)}
            />
          )}

          {error && (
            <div className="absolute inset-x-4 bottom-28 rounded-md bg-background p-2 text-foreground shadow-lg">
              <FormError>{error}</FormError>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

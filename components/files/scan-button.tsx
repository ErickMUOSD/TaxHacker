"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { Button } from "@/components/ui/button"
import { scannerMessages } from "@/lib/scanner/messages"
import { useRouter } from "next/navigation"
import { ComponentProps, useState } from "react"
import { CameraScanner } from "./scanner/camera-scanner"
import { requestDeviceMotionPermission } from "./scanner/use-device-motion"

/**
 * Opens the guided camera scanner. The final photo goes through the same `uploadFilesAction`
 * pipeline as UploadButton, tagged with `source: "camera"` so the server can re-check sharpness.
 */
export function ScanButton({ children, ...props }: { children: React.ReactNode } & ComponentProps<typeof Button>) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [open, setOpen] = useState(false)
  // New key per opening so the scanner always starts from a clean state
  const [session, setSession] = useState(0)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    // iOS only grants motion sensors from inside a user gesture, so ask before opening
    requestDeviceMotionPermission().catch(() => false)
    setSession((n) => n + 1)
    setOpen(true)
  }

  const uploadScan = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append("files", file)
    formData.append("source", "camera")
    try {
      const result = await uploadFilesAction(formData)
      if (!result.success) return result.error || scannerMessages.uploadFailed
    } catch (error) {
      console.error("Scan upload failed:", error)
      return error instanceof Error ? error.message : scannerMessages.uploadFailed
    }
    setOpen(false)
    showNotification({ code: "sidebar.unsorted", message: "new" })
    setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
    router.push("/unsorted")
    return null
  }

  return (
    <>
      <Button onClick={handleClick} type="button" title={scannerMessages.button} {...props}>
        {children}
      </Button>
      <CameraScanner key={session} open={open} onOpenChange={setOpen} onFile={uploadScan} />
    </>
  )
}

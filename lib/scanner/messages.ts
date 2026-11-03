import { FrameIssue } from "./evaluate"

/** All user-facing strings of the camera scanner, in one place for future translation. */
export const scannerMessages = {
  button: "Scan with camera",
  title: "Scan receipt",
  starting: "Starting camera…",
  loadingDetector: "Loading document detector…",
  ready: "Hold still… capturing",
  issues: {
    motion: "Hold the phone still",
    no_document: "Point the camera at the receipt",
    too_far: "Move closer to the document",
    too_dark: "Low light, turn on the flashlight",
    glare: "Glare detected, tilt slightly",
    blurry: "Hold still, focusing…",
  } satisfies Record<FrameIssue, string>,
  capture: "Capture",
  close: "Close",
  torchOn: "Turn flashlight on",
  torchOff: "Turn flashlight off",
  preview: {
    title: "Check the crop",
    hint: "Drag the corners to fit the document edges",
    usePhoto: "Use photo",
    retake: "Retake",
    processing: "Processing…",
    uploading: "Uploading…",
  },
  fallback: {
    title: "Camera not available",
    noSecureContext: "The camera needs a secure (HTTPS) connection.",
    denied: "Camera access was denied. You can allow it in your browser settings.",
    unsupported: "This browser does not support live camera access.",
    generic: "Could not start the camera.",
    action: "Take a photo instead",
  },
  uploadFailed: "Upload failed",
} as const

export function issueMessage(issue: FrameIssue | null): string {
  return issue ? scannerMessages.issues[issue] : scannerMessages.ready
}

import { fileExists, fullPathForFile } from "@/lib/files"
import { generateFilePreviews } from "@/lib/previews/generate"
import { File, User } from "@/prisma/client"
import { reportsConfig } from "./config"
import { ReportImage, toReportJpeg } from "./images"

export type { ReportImage }

export type ReportAttachments = {
  images: ReportImage[]
  /** One label per attached file, e.g. "receipt.pdf (3 pages)" or "notes.docx (not embedded)". */
  labels: string[]
}

/**
 * Turns a transaction's attached files into embeddable images. Images map to one picture, PDFs to one
 * per page (up to `maxPdfPages`, rendered through the cached preview pipeline). Other types and
 * broken/missing files are skipped but still listed in `labels`, so the report never fails because of them.
 */
export async function loadReportAttachments(user: User, files: File[]): Promise<ReportAttachments> {
  const images: ReportImage[] = []
  const labels: string[] = []

  for (const file of files) {
    const fullPath = fullPathForFile(user, file)
    if (!(await fileExists(fullPath))) {
      labels.push(`${file.filename} (missing)`)
      continue
    }

    const isPdf = file.mimetype === "application/pdf"
    if (!isPdf && !file.mimetype.startsWith("image/")) {
      labels.push(`${file.filename} (not embedded)`)
      continue
    }

    try {
      const { previews } = await generateFilePreviews(user, fullPath, file.mimetype)
      const sources = isPdf ? previews.slice(0, reportsConfig.maxPdfPages) : previews.slice(0, 1)
      let embedded = 0
      for (const source of sources) {
        images.push(await toReportJpeg(source))
        embedded++
      }
      if (isPdf) {
        const extra = previews.length > embedded ? `, first ${embedded} embedded` : ""
        labels.push(`${file.filename} (${previews.length} page${previews.length === 1 ? "" : "s"}${extra})`)
      } else {
        labels.push(file.filename)
      }
    } catch (error) {
      console.error(`Report: failed to embed ${file.filename}:`, error)
      labels.push(`${file.filename} (could not be embedded)`)
    }
  }

  return { images, labels }
}

import { fileExists, fullPathForFile } from "@/lib/files"
import { resolvePreviewFormat } from "@/lib/previews/format"
import { enhanceForLLM } from "@/lib/scanner/server"
import { generateFilePreviews } from "@/lib/previews/generate"
import { getSettings } from "@/models/settings"
import { File, User } from "@/prisma/client"
import fs from "fs/promises"

const MAX_PAGES_TO_ANALYZE = 4

export type AnalyzeAttachment = {
  filename: string
  contentType: string
  base64: string
}

export const loadAttachmentsForAI = async (user: User, file: File): Promise<AnalyzeAttachment[]> => {
  const fullFilePath = fullPathForFile(user, file)
  const isFileExists = await fileExists(fullFilePath)
  if (!isFileExists) {
    throw new Error("File not found on disk")
  }

  const settings = await getSettings(user.id)
  const format = resolvePreviewFormat(settings.llm_attachment_format)
  const { contentType, previews } = await generateFilePreviews(user, fullFilePath, file.mimetype, format)

  // Optional contrast boost for faded thermal receipts; done in memory so cached previews stay untouched
  const enhance = settings.llm_enhance_low_contrast === "true" && contentType.startsWith("image/")

  return Promise.all(
    previews.slice(0, MAX_PAGES_TO_ANALYZE).map(async (preview) => ({
      filename: file.filename,
      contentType: contentType,
      base64: enhance ? await loadEnhancedAsBase64(preview) : await loadFileAsBase64(preview),
    }))
  )
}

export const loadFileAsBase64 = async (filePath: string): Promise<string> => {
  const buffer = await fs.readFile(filePath)
  return Buffer.from(buffer).toString("base64")
}

const loadEnhancedAsBase64 = async (filePath: string): Promise<string> => {
  try {
    return (await enhanceForLLM(filePath)).toString("base64")
  } catch (error) {
    console.warn("Contrast enhancement failed, sending original:", error)
    return loadFileAsBase64(filePath)
  }
}

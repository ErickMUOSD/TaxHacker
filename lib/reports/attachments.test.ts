import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import sharp from "sharp"
import { afterAll, describe, expect, it, vi } from "vitest"

const tmpRoot = await mkdtemp(path.join(tmpdir(), "th-reports-"))
process.env.UPLOAD_PATH = tmpRoot

vi.mock("@/lib/config", () => ({
  default: {
    upload: {
      images: { maxWidth: 1800, maxHeight: 1800, quality: 90 },
      pdfs: { maxPages: 10, dpi: 150, quality: 90, maxWidth: 1500, maxHeight: 1500 },
    },
    selfHosted: { isEnabled: true },
  },
}))

const { loadReportAttachments } = await import("./attachments")

const user = { id: "u1", email: "u@example.com" } as never
const userDir = path.join(tmpRoot, "u@example.com")

async function storeFile(name: string, data: Buffer) {
  const relative = path.join("2026", "01", name)
  await mkdir(path.join(userDir, "2026", "01"), { recursive: true })
  await writeFile(path.join(userDir, relative), data)
  return relative
}

const fileRow = (id: string, filename: string, filePath: string, mimetype: string) =>
  ({ id, filename, path: filePath, mimetype }) as never

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

describe("loadReportAttachments", () => {
  it("re-encodes PNG and WebP attachments as JPEG and skips missing/unsupported files", async () => {
    const png = await sharp({ create: { width: 1200, height: 2000, channels: 4, background: "#ffffff" } })
      .png()
      .toBuffer()
    const webp = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#cccccc" } })
      .webp()
      .toBuffer()

    const files = [
      fileRow("1", "receipt.png", await storeFile("1.png", png), "image/png"),
      fileRow("2", "photo.webp", await storeFile("2.webp", webp), "image/webp"),
      fileRow("3", "gone.jpg", "2026/01/does-not-exist.jpg", "image/jpeg"),
      fileRow("4", "notes.docx", await storeFile("4.docx", Buffer.from("docx")), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ]

    const { images, labels } = await loadReportAttachments(user, files)

    expect(images).toHaveLength(2)
    for (const image of images) {
      const meta = await sharp(image.buffer).metadata()
      expect(meta.format).toBe("jpeg")
      expect(image.width).toBeLessThanOrEqual(900)
    }
    expect(labels).toEqual(["receipt.png", "photo.webp", "gone.jpg (missing)", "notes.docx (not embedded)"])
  })
})

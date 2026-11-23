import { prisma } from "@/lib/db"
import { parseReportSelection, REPORT_SELECTION_SETTING, ReportSelection } from "@/lib/reports/selection"

export type ReportDownloadInput = {
  reportType?: string
  name: string
  dateFrom: string
  dateTo: string
  columns: string[]
  includeAttachments: boolean
  transactionsCount: number
}

/** Stores a download in the user's report history. */
export async function createReportDownload(userId: string, input: ReportDownloadInput) {
  return prisma.reportDownload.create({
    data: {
      userId,
      reportType: input.reportType ?? "transactions",
      name: input.name,
      dateFrom: new Date(`${input.dateFrom}T00:00:00.000Z`),
      dateTo: new Date(`${input.dateTo}T00:00:00.000Z`),
      columns: input.columns,
      includeAttachments: input.includeAttachments,
      transactionsCount: input.transactionsCount,
    },
  })
}

export async function getReportDownloads(userId: string, limit = 50) {
  return prisma.reportDownload.findMany({
    where: { userId },
    orderBy: { downloadedAt: "desc" },
    take: limit,
  })
}

/** The column/attachment choice from the user's last transactions report download. */
export async function getReportSelection(userId: string): Promise<ReportSelection> {
  const setting = await prisma.setting.findUnique({
    where: { userId_code: { userId, code: REPORT_SELECTION_SETTING } },
  })
  return parseReportSelection(setting?.value)
}

export async function saveReportSelection(userId: string, selection: ReportSelection) {
  const value = JSON.stringify(selection)
  return prisma.setting.upsert({
    where: { userId_code: { userId, code: REPORT_SELECTION_SETTING } },
    update: { value },
    create: { userId, code: REPORT_SELECTION_SETTING, name: "Transactions report selection", value },
  })
}

import { getCurrentUser } from "@/lib/auth"
import { loadReportAttachments } from "@/lib/reports/attachments"
import { transactionFileIds } from "@/lib/reports/columns"
import { reportsConfig } from "@/lib/reports/config"
import { buildTransactionsReport, TransactionAttachments } from "@/lib/reports/xlsx"
import { getFields } from "@/models/fields"
import { getFilesByIds } from "@/models/files"
import { getTransactions } from "@/models/transactions"
import { NextResponse } from "next/server"
import { z } from "zod"

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, "Invalid date")

const querySchema = z
  .object({ dateFrom: isoDate, dateTo: isoDate })
  .refine((q) => q.dateFrom <= q.dateTo, { message: "Start date must be before end date" })

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function errorResponse(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status })
}

/** GET /reports/transactions?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD → .xlsx with embedded attachments. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues.map((issue) => issue.message).join(", "))
  }
  const { dateFrom, dateTo } = parsed.data

  try {
    const [fields, { transactions }] = await Promise.all([
      getFields(user.id),
      getTransactions(user.id, { dateFrom, dateTo, ordering: "issuedAt" }),
    ])

    if (transactions.length === 0) {
      return errorResponse(404, "No transactions with a date in this range")
    }
    if (transactions.length > reportsConfig.maxTransactions) {
      return errorResponse(
        413,
        `This range has ${transactions.length} transactions (max ${reportsConfig.maxTransactions}). Narrow the date range.`
      )
    }

    // One query for every attachment in the range, then keep each transaction's own file order
    const files = await getFilesByIds([...new Set(transactions.flatMap(transactionFileIds))], user.id)
    const filesById = new Map(files.map((file) => [file.id, file]))

    const attachments = new Map<string, TransactionAttachments>()
    for (const transaction of transactions) {
      const transactionFiles = transactionFileIds(transaction)
        .map((id) => filesById.get(id))
        .filter((file) => file !== undefined)
      if (transactionFiles.length > 0) {
        attachments.set(transaction.id, await loadReportAttachments(user, transactionFiles))
      }
    }

    const buffer = await buildTransactionsReport({
      fields,
      transactions,
      attachments,
      range: { from: dateFrom, to: dateTo },
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="transactions_${dateFrom}_${dateTo}.xlsx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Failed to build transactions report:", error)
    return errorResponse(500, "Failed to build the report")
  }
}

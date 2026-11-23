import { ReportDownloadsHistory } from "@/components/reports/report-downloads-history"
import { TransactionsReportForm } from "@/components/reports/transactions-report-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { buildReportColumns } from "@/lib/reports/columns"
import { reportsConfig } from "@/lib/reports/config"
import { getFields } from "@/models/fields"
import { getReportDownloads, getReportSelection } from "@/models/reports"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Reports",
  description: "Download reports of your transactions",
}

export default async function ReportsPage() {
  const user = await getCurrentUser()
  const [fields, selection, downloads] = await Promise.all([
    getFields(user.id),
    getReportSelection(user.id),
    getReportDownloads(user.id),
  ])
  const columns = buildReportColumns(fields).map(({ code, header, isExtra }) => ({ code, header, isExtra }))
  const fieldNames = Object.fromEntries(columns.map((column) => [column.code, column.header]))

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
      </header>

      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Transactions report (Excel)</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">
                One row per transaction with a column for each field you choose, plus the attached receipts embedded
                as images if you want them (PDFs show up to their first {reportsConfig.maxPdfPages} pages).
              </span>
              <span className="block">
                Transactions are selected by their date; transactions without a date are not included. Up to{" "}
                {reportsConfig.maxTransactions} transactions per report.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionsReportForm columns={columns} initialSelection={selection} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Download history</CardTitle>
            <CardDescription>The last {downloads.length > 0 ? downloads.length : ""} reports you downloaded.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportDownloadsHistory
              downloads={downloads.map((download) => ({
                id: download.id,
                name: download.name,
                dateFrom: download.dateFrom.toISOString().slice(0, 10),
                dateTo: download.dateTo.toISOString().slice(0, 10),
                downloadedAt: download.downloadedAt.toISOString(),
                transactionsCount: download.transactionsCount,
                includeAttachments: download.includeAttachments,
                columns: (Array.isArray(download.columns) ? download.columns : [])
                  .filter((code): code is string => typeof code === "string")
                  .map((code) => fieldNames[code] ?? code),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

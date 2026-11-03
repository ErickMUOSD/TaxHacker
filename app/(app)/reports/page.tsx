import { TransactionsReportForm } from "@/components/reports/transactions-report-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { reportsConfig } from "@/lib/reports/config"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Reports",
  description: "Download reports of your transactions",
}

export default function ReportsPage() {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Transactions report (Excel)</CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              One row per transaction with a column for each of your current fields, plus every attached receipt
              embedded as an image (PDFs show up to their first {reportsConfig.maxPdfPages} pages).
            </span>
            <span className="block">
              Transactions are selected by their date; transactions without a date are not included. Up to{" "}
              {reportsConfig.maxTransactions} transactions per report.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsReportForm />
        </CardContent>
      </Card>
    </>
  )
}

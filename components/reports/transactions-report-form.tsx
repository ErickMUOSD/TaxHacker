"use client"

import { FormError } from "@/components/forms/error"
import { DateRangePicker } from "@/components/forms/date-range-picker"
import { Button } from "@/components/ui/button"
import { useDownload } from "@/hooks/use-download"
import { format, startOfMonth, subMonths } from "date-fns"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { useState } from "react"
import { DateRange } from "react-day-picker"

const toIsoDay = (date: Date) => format(date, "yyyy-MM-dd")

export function TransactionsReportForm() {
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(subMonths(new Date(), 11)),
    to: new Date(),
  }))
  const [error, setError] = useState("")
  const { download, isDownloading } = useDownload({ onError: (err) => setError(err.message) })

  const canDownload = !!range?.from && !!range?.to && !isDownloading

  const handleDownload = async () => {
    if (!range?.from || !range?.to) return
    setError("")
    const from = toIsoDay(range.from)
    const to = toIsoDay(range.to)
    const params = new URLSearchParams({ dateFrom: from, dateTo: to })
    await download(`/reports/transactions?${params}`, `transactions_${from}_${to}.xlsx`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Date range:</span>
        <DateRangePicker defaultDate={range} onChange={setRange} />
      </div>

      {(!range?.from || !range?.to) && (
        <p className="text-sm text-muted-foreground">Pick both a start and an end date.</p>
      )}

      <div>
        <Button onClick={handleDownload} disabled={!canDownload}>
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building report…
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel
            </>
          )}
        </Button>
      </div>

      {error && <FormError>{error}</FormError>}
    </div>
  )
}

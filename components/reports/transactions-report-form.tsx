"use client"

import { DateRangePicker } from "@/components/forms/date-range-picker"
import { FormError } from "@/components/forms/error"
import { ReportColumnOption, ReportColumnsDialog } from "@/components/reports/report-columns-dialog"
import { Button } from "@/components/ui/button"
import { useDownload } from "@/hooks/use-download"
import { ReportSelection } from "@/lib/reports/selection"
import { format, startOfMonth, subMonths } from "date-fns"
import { FileSpreadsheet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DateRange } from "react-day-picker"

const toIsoDay = (date: Date) => format(date, "yyyy-MM-dd")

type Props = {
  columns: ReportColumnOption[]
  initialSelection: ReportSelection
}

export function TransactionsReportForm({ columns, initialSelection }: Props) {
  const router = useRouter()
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(subMonths(new Date(), 11)),
    to: new Date(),
  }))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const excluded = new Set(initialSelection.excludedColumns)
    return new Set(columns.map((column) => column.code).filter((code) => !excluded.has(code)))
  })
  const [includeAttachments, setIncludeAttachments] = useState(initialSelection.includeAttachments)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const { download, isDownloading } = useDownload({
    onError: (err) => setError(err.message),
    onSuccess: () => {
      setDialogOpen(false)
      setName("")
      router.refresh() // refresh the download history
    },
  })

  const from = range?.from ? toIsoDay(range.from) : ""
  const to = range?.to ? toIsoDay(range.to) : ""
  const hasRange = !!from && !!to
  const defaultName = `transactions_${from}_${to}`

  const handleDownload = async () => {
    if (!hasRange) return
    setError("")
    const params = new URLSearchParams({
      dateFrom: from,
      dateTo: to,
      columns: columns.map((column) => column.code).filter((code) => selected.has(code)).join(","),
      attachments: includeAttachments ? "1" : "0",
    })
    if (name.trim()) params.set("name", name.trim())
    await download(`/reports/transactions?${params}`, `${name.trim() || defaultName}.xlsx`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Date range:</span>
        <DateRangePicker defaultDate={range} onChange={setRange} />
      </div>

      {!hasRange && <p className="text-sm text-muted-foreground">Pick both a start and an end date.</p>}

      <div>
        <Button
          onClick={() => {
            setError("")
            setDialogOpen(true)
          }}
          disabled={!hasRange}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Download Excel…
        </Button>
      </div>

      <ReportColumnsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        columns={columns}
        selected={selected}
        onSelectedChange={setSelected}
        includeAttachments={includeAttachments}
        onIncludeAttachmentsChange={setIncludeAttachments}
        name={name}
        namePlaceholder={defaultName}
        onNameChange={setName}
        rangeLabel={`From ${from} to ${to}`}
        isDownloading={isDownloading}
        error={error ? <FormError>{error}</FormError> : undefined}
        onConfirm={handleDownload}
      />
    </div>
  )
}

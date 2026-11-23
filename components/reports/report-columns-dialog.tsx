"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, Loader2, Paperclip } from "lucide-react"
import { ReactNode } from "react"

export type ReportColumnOption = { code: string; header: string; isExtra: boolean }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ReportColumnOption[]
  selected: Set<string>
  onSelectedChange: (selected: Set<string>) => void
  includeAttachments: boolean
  onIncludeAttachmentsChange: (value: boolean) => void
  name: string
  namePlaceholder: string
  onNameChange: (value: string) => void
  rangeLabel: string
  isDownloading: boolean
  error?: ReactNode
  onConfirm: () => void
}

/** Lets the user pick which columns (and whether receipts) go into the Excel report before downloading. */
export function ReportColumnsDialog(props: Props) {
  const { columns, selected, onSelectedChange } = props
  const standard = columns.filter((column) => !column.isExtra)
  const custom = columns.filter((column) => column.isExtra)

  const setMany = (codes: string[], checked: boolean) => {
    const next = new Set(selected)
    for (const code of codes) {
      if (checked) next.add(code)
      else next.delete(code)
    }
    onSelectedChange(next)
  }

  const allCodes = columns.map((column) => column.code)
  const selectedCount = allCodes.filter((code) => selected.has(code)).length

  return (
    <Dialog open={props.open} onOpenChange={(open) => !props.isDownloading && props.onOpenChange(open)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose what goes into the report</DialogTitle>
          <DialogDescription>
            {props.rangeLabel} · Your selection is remembered for the next download.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 overflow-y-auto pr-1 -mr-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-name">Report name</Label>
            <Input
              id="report-name"
              value={props.name}
              placeholder={props.namePlaceholder}
              onChange={(event) => props.onNameChange(event.target.value)}
              maxLength={120}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Columns{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedCount} of {allCodes.length} selected)
              </span>
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setMany(allCodes, true)}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setMany(allCodes, false)}>
                Clear
              </Button>
            </div>
          </div>

          <ColumnGroup title="Standard fields" columns={standard} selected={selected} onToggle={setMany} />
          {custom.length > 0 && (
            <ColumnGroup title="Custom fields" columns={custom} selected={selected} onToggle={setMany} />
          )}

          <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
            <Checkbox
              checked={props.includeAttachments}
              onCheckedChange={(checked) => props.onIncludeAttachmentsChange(checked === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Attached receipts
              </span>
              <span className="text-xs text-muted-foreground">
                Embeds every receipt as an image plus a file list column. Turn off for a lighter, faster file.
              </span>
            </span>
          </label>
        </div>

        {props.error}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.isDownloading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={props.onConfirm} disabled={selectedCount === 0 || props.isDownloading}>
            {props.isDownloading ? (
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ColumnGroup({
  title,
  columns,
  selected,
  onToggle,
}: {
  title: string
  columns: ReportColumnOption[]
  selected: Set<string>
  onToggle: (codes: string[], checked: boolean) => void
}) {
  const codes = columns.map((column) => column.code)
  const count = codes.filter((code) => selected.has(code)).length
  const groupState = count === 0 ? false : count === codes.length ? true : "indeterminate"

  return (
    <fieldset className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer w-fit">
        <Checkbox checked={groupState} onCheckedChange={() => onToggle(codes, groupState !== true)} />
        {title}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {columns.map((column) => (
          <label
            key={column.code}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.has(column.code)}
              onCheckedChange={(checked) => onToggle([column.code], checked === true)}
            />
            <span className="truncate">{column.header}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

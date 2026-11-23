"use client"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { format } from "date-fns"
import { Paperclip } from "lucide-react"

export type ReportDownloadRow = {
  id: string
  name: string
  dateFrom: string
  dateTo: string
  downloadedAt: string
  transactionsCount: number
  includeAttachments: boolean
  columns: string[]
}

export function ReportDownloadsHistory({ downloads }: { downloads: ReportDownloadRow[] }) {
  if (downloads.length === 0) {
    return <p className="text-sm text-muted-foreground">No reports downloaded yet.</p>
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Date range</TableHead>
            <TableHead>Contents</TableHead>
            <TableHead className="text-right">Downloaded at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {downloads.map((download) => (
            <TableRow key={download.id}>
              <TableCell className="font-medium break-all">{download.name}.xlsx</TableCell>
              <TableCell className="whitespace-nowrap">
                {download.dateFrom} → {download.dateTo}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{download.transactionsCount} transactions</Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="cursor-default">
                        {download.columns.length} columns
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{download.columns.join(", ")}</TooltipContent>
                  </Tooltip>
                  {download.includeAttachments && (
                    <Badge variant="outline" className="gap-1">
                      <Paperclip className="h-3 w-3" /> receipts
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {format(new Date(download.downloadedAt), "yyyy-MM-dd HH:mm")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}

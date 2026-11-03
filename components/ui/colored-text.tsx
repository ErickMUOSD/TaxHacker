import { cn } from "@/lib/utils"

export function ColoredText({
  children,
  className,
}: { children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("bg-gradient-to-r from-[#0077B6] via-brand-blue to-[#00B8D4] bg-clip-text text-transparent", className)}>
      {children}
    </span>
  )
}

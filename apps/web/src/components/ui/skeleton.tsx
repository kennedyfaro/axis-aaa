import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[3px] bg-panel-3", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy className="px-4 py-2" role="status" aria-label="Carregando dados">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line/60 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton
              key={col}
              className={cn("h-3", col === 0 ? "w-44" : col === 1 ? "w-24" : "w-16")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("panel p-4", className)} aria-busy role="status" aria-label="Carregando painel">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-3 h-2.5 w-40" />
    </div>
  );
}

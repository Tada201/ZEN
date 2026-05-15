
export function SectionSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border p-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-8 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div className="flex justify-between">
            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-2 pt-2">
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

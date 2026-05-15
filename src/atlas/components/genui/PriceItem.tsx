export function PriceItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

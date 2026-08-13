import { FileText } from "lucide-react";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  date: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency?: string;
  status?: "Paid" | "Unpaid" | "Overdue" | string;
}

export function InvoiceCard({ data }: { data: InvoiceData }) {
  const vendor = data.vendor || "Vendor";
  const invoiceNumber = data.invoiceNumber || "--";
  const date = data.date || "--";
  const lineItems = data.lineItems || [];
  const subtotal = data.subtotal ?? 0;
  const tax = data.tax ?? 0;
  const total = data.total ?? 0;
  const currency = data.currency || "USD";
  const status = (data.status || "Unpaid").toLowerCase();

  const getStatusColor = (s: string) => {
    switch (s) {
      case "paid":
        return "text-emerald-400 border-emerald-500 bg-emerald-500/10";
      case "overdue":
        return "text-rose-400 border-rose-500 bg-rose-500/10";
      default:
        return "text-amber-400 border-amber-500 bg-amber-500/10";
    }
  };

  const formatAmount = (val: number) => {
    return val.toLocaleString(undefined, {
      style: "currency",
      currency: currency,
    });
  };

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-border bg-muted text-primary-foreground">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary-foreground leading-tight">{vendor}</h3>
            <span className="text-[10px] font-mono text-muted-foreground">Inv #{invoiceNumber}</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusColor(status)}`}>
          {status}
        </span>
      </div>

      {lineItems.length > 0 && (
        <div className="mb-4">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase tracking-wider font-mono">
                <th className="pb-1.5 font-normal">Item</th>
                <th className="pb-1.5 text-center font-normal">Qty</th>
                <th className="pb-1.5 text-right font-normal">Price</th>
                <th className="pb-1.5 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {lineItems.map((item, idx) => (
                <tr key={idx} className="text-primary-foreground">
                  <td className="py-2 pr-2 font-medium truncate max-w-[150px]">{item.description}</td>
                  <td className="py-2 text-center text-primary-foreground font-mono">{item.qty}</td>
                  <td className="py-2 text-right text-primary-foreground font-mono">{formatAmount(item.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold font-mono">{formatAmount(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-border pt-3 space-y-1.5 text-[11px] font-mono">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="text-primary-foreground">{formatAmount(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span className="text-primary-foreground">{formatAmount(tax)}</span>
        </div>
        <div className="flex justify-between text-sm pt-1.5 border-t border-border font-semibold text-primary-foreground">
          <span>Total Amount</span>
          <span className="text-primary font-bold">{formatAmount(total)}</span>
        </div>
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-border text-[9px] text-muted-foreground font-mono">
        <span>Issued Date</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "connected"; latency?: number }
  | { state: "failed"; error?: string };

interface ConnectionTestButtonProps {
  status: ConnectionStatus;
  onTest: () => void;
  disabled?: boolean;
  className?: string;
}

export function ConnectionTestButton({
  status,
  onTest,
  disabled = false,
  className,
}: ConnectionTestButtonProps) {
  const isTesting = status.state === "testing";

  const icon = (() => {
    switch (status.state) {
      case "testing":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "connected":
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-400" />;
      default:
        return <HelpCircle className="h-3 w-3 text-zinc-600" />;
    }
  })();

  const label = (() => {
    switch (status.state) {
      case "testing":
        return "Testing...";
      case "connected":
        return status.latency ? `${status.latency}ms` : "Connected";
      case "failed":
        return "Failed";
      default:
        return "Test";
    }
  })();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || isTesting}
        onClick={onTest}
        className={cn(
          "h-6 px-2 text-[10px] font-medium gap-1",
          status.state === "connected"
            ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            : status.state === "failed"
            ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
        )}
      >
        {icon}
        {label}
      </Button>
      {status.state === "failed" && status.error && (
        <span className="text-[9px] text-zinc-600 max-w-[120px] truncate" title={status.error}>
          {status.error}
        </span>
      )}
    </div>
  );
}

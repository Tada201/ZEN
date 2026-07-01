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
        return <CheckCircle2 className="h-3 w-3 text-success" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-destructive" />;
      default:
        return <HelpCircle className="h-3 w-3 text-muted-foreground/70" />;
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
            ? "text-success hover:text-success hover:bg-success/10"
            : status.state === "failed"
            ? "text-destructive hover:text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        {icon}
        {label}
      </Button>
      {status.state === "failed" && status.error && (
        <span className="text-[9px] text-muted-foreground/70 max-w-[120px] truncate" title={status.error}>
          {status.error}
        </span>
      )}
    </div>
  );
}

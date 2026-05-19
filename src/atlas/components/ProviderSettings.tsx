import { useState, useEffect, useMemo } from "react";
import {
  Key, Shield, Check, AlertCircle,
  Trash2, Plus, ExternalLink,
  Loader2, RefreshCw, Eye, EyeOff,
  BrainCircuit, Hexagon, MessageSquare, Zap, Cpu
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader,
  SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Provider {
  id: string;
  label: string;
  placeholder: string;
  docsUrl: string;
  icon: any;
}

const PROVIDERS: Provider[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-...", docsUrl: "https://platform.openai.com/api-keys", icon: BrainCircuit },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", docsUrl: "https://console.anthropic.com/settings/keys", icon: Hexagon },
  { id: "google", label: "Google AI", placeholder: "AIza...", docsUrl: "https://aistudio.google.com/app/apikey", icon: Zap },
  { id: "xai", label: "X.AI / Grok", placeholder: "xai-...", docsUrl: "https://console.x.ai/", icon: MessageSquare },
  { id: "custom", label: "Custom (OpenAI)", placeholder: "sk-...", docsUrl: "", icon: Cpu },
];

interface ApiKey {
  id: string;
  provider: string;
  name: string;
  keyPreview: string;
  createdAt: number;
  validationStatus?: "validated" | "pending" | "failed";
  isDefault?: boolean;
}

interface ProviderSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderSettings({
  open,
  onOpenChange,
}: ProviderSettingsProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [defaultKeys, setDefaultKeys] = useState<Record<string, string>>({});

  /* ── Fetch keys ── */
  const fetchKeys = async () => {
    try {
      const r = await fetch("/chat-api/api-keys");
      if (!r.ok) throw new Error("Failed to fetch keys");
      const data = (await r.json()) as ApiKey[];

      setKeys((prev) => {
        const prevMap = new Map(prev.map((k) => [k.id, k]));
        return data.map((newKey) => ({
          ...newKey,
          validationStatus:
            prevMap.get(newKey.id)?.validationStatus ?? "pending",
          isDefault:
            newKey.isDefault ??
            prevMap.get(newKey.id)?.isDefault ??
            false,
        }));
      });

      // Initialise default keys for providers that don't have one yet
      setDefaultKeys((prev) => {
        const next = { ...prev };
        const providerSet = new Set(data.map((k) => k.provider));
        providerSet.forEach((p) => {
          if (!next[p]) {
            const providerKeys = data.filter((k) => k.provider === p);
            const def =
              providerKeys.find((k) => k.isDefault) ?? providerKeys[0];
            if (def) next[p] = def.id;
          }
        });
        return next;
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (open) fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── Validate a single key (Phase 9.1 / 9.2) ── */
  const validateKey = async (keyId: string) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === keyId ? { ...k, validationStatus: "pending" } : k,
      ),
    );
    try {
      const r = await fetch(`/chat-api/api-keys/${keyId}/validate`, {
        method: "POST",
      });
      const body = (await r.json()) as { valid: boolean; error?: string };
      const status: ApiKey["validationStatus"] =
        r.ok && body.valid === true ? "validated" : "failed";
      setKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, validationStatus: status } : k)),
      );
      if (r.ok && body.valid === true) {
        toast.success("Key validated");
      } else {
        toast.error(body.error ?? "Key validation failed");
      }
    } catch {
      setKeys((prev) =>
        prev.map((k) =>
          k.id === keyId ? { ...k, validationStatus: "failed" } : k,
        ),
      );
      toast.error("Key validation failed");
    }
  };

  /* ── Add a new key (Phase 9.1) ── */
  const addKey = async () => {
    if (!addingProvider || !newKeyValue) return;
    setLoading(true);
    try {
      const r = await fetch("/chat-api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: addingProvider,
          keyValue: newKeyValue,
          baseUrl: newBaseUrl,
          name: `${addingProvider} Key`,
        }),
      });
      if (!r.ok) throw new Error("Failed to save key");
      const newKey: ApiKey = await r.json();
      toast.success("API key saved successfully");

      // Auto-validate the freshly saved key
      try {
        const vr = await fetch(`/chat-api/api-keys/${newKey.id}/validate`, {
          method: "POST",
        });
        const body = (await vr.json()) as { valid: boolean; error?: string };
        if (vr.ok && body.valid === true) {
          setKeys((prev) =>
            prev.map((k) =>
              k.id === newKey.id ? { ...k, validationStatus: "validated" } : k,
            ),
          );
          toast.success("Key validated!");
        } else {
          setKeys((prev) =>
            prev.map((k) =>
              k.id === newKey.id ? { ...k, validationStatus: "failed" } : k,
            ),
          );
          toast.error(body.error ?? "Key validation failed");
        }
      } catch {
        // non-blocking
      }

      setAddingProvider(null);
      setNewKeyValue("");
      setNewBaseUrl("");
      fetchKeys();
    } catch (error) {
      toast.error("Failed to save API key");
    } finally {
      setLoading(false);
    }
  };

  /* ── Delete a key ── */
  const deleteKey = async (id: string) => {
    try {
      const r = await fetch(`/chat-api/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Failed to delete key");
      toast.success("API key removed");
      fetchKeys();
    } catch (error) {
      toast.error("Failed to remove API key");
    }
  };

  /* ── Mark a key as default for its provider (Phase 9.3) ── */
  const handleDefaultChange = async (provider: string, keyId: string) => {
    setDefaultKeys((prev) => ({ ...prev, [provider]: keyId }));
    setKeys((prev) =>
      prev.map((k) => ({
        ...k,
        isDefault: k.id === keyId,
      })),
    );
    // Server sync — endpoint now works properly
    try {
      const r = await fetch(`/chat-api/api-keys/${keyId}/default`, {
        method: "POST",
      });
      if (r.ok) {
        const body = (await r.json()) as { isDefault?: number };
        setKeys((prev) =>
          prev.map((k) => ({
            ...k,
            isDefault: k.id === keyId ? body.isDefault === 1 : false,
          })),
        );
      }
    } catch {
      // non-blocking
    }
  };

  /* ── Keys grouped by provider (Phase 9.3) ── */
  const groupedKeys = useMemo(() => {
    const groups: Record<string, ApiKey[]> = {};
    keys.forEach((k) => {
      if (!groups[k.provider]) groups[k.provider] = [];
      groups[k.provider].push(k);
    });
    return groups;
  }, [keys]);

  /* ── Status helpers ── */
  const statusDot = (status: ApiKey["validationStatus"]) => (
    <div
      role="status"
      aria-label={`Validation status: ${status || 'pending'}`}
      className={cn("h-3 w-3 rounded-full shrink-0 ring-1 ring-black/5", {
        "bg-emerald-500": status === "validated",
        "bg-amber-400": !status || status === "pending",
        "bg-red-500": status === "failed",
      })}
    />
  );

  const statusLabel = (status: ApiKey["validationStatus"]) => (
    <span
      className={cn("text-xs shrink-0 font-medium", {
        "text-emerald-500": status === "validated",
        "text-amber-500": !status || status === "pending",
        "text-red-500": status === "failed",
      })}
    >
      {status === "validated"
        ? "✓ Validated"
        : status === "failed"
          ? "✗ Failed"
          : "⚠ Pending"}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            AI Provider Settings
          </DialogTitle>
          <DialogDescription>
            Configure your API keys to enable different AI models.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="max-h-[500px]">
            <div className="p-6 space-y-6">
              {/* ── Configured Providers ── */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Configured Providers
                </h3>

                {keys.length === 0 ? (
                  <div className="p-8 border border-dashed border-border/60 rounded-xl text-center bg-muted/20">
                    <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">
                      No API keys configured yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedKeys).map(([provider, providerKeys]) => (
                      <div key={provider} className="space-y-2">
                        {/* Provider group header */}
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium capitalize">
                            {provider}
                          </h4>
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 font-mono"
                          >
                            {providerKeys.length} key
                            {providerKeys.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>

                        {/* Radio group for default selection (Phase 9.3) */}
                        <RadioGroup
                          value={
                            defaultKeys[provider] ?? providerKeys[0]?.id ?? ""
                          }
                          onValueChange={(value) =>
                            handleDefaultChange(provider, value)
                          }
                        >
                          {providerKeys.map((key) => (
                            <div
                              key={key.id}
                              className={cn(
                                "flex items-center gap-2 p-3 rounded-xl border transition-all",
                                defaultKeys[provider] === key.id
                                  ? "border-primary/40 bg-primary/[0.03]"
                                  : "border-border/40 bg-card/40",
                              )}
                            >
                              <RadioGroupItem
                                value={key.id}
                                id={`default-${key.id}`}
                              />

                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {/* Status dot (Phase 9.2) */}
                                {statusDot(key.validationStatus)}

                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {key.name || key.provider}
                                  </div>
                                  <div className="text-[10px] font-mono text-muted-foreground">
                                    {key.keyPreview}
                                  </div>
                                </div>

                                {/* Status label (Phase 9.2) */}
                                {statusLabel(key.validationStatus)}
                              </div>

                              {/* Re-validate button (Phase 9.2) */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => validateKey(key.id)}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteKey(key.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Add Key (Phase 9.3 — no isConfigured guard) ── */}
              <section className="space-y-4 pt-4 border-t border-border/40">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Plus className="h-4 w-4 text-primary" />
                  Add Key
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {PROVIDERS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setAddingProvider(p.id)}
                        className={cn(
                          "relative flex flex-col items-center justify-center p-6 rounded-xl border transition-all text-center gap-3 overflow-hidden",
                          "bg-card/40 border-border/40 hover:border-primary/40 hover:bg-primary/[0.02] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        )}
                      >
                        <div className="h-10 w-10 rounded-full bg-background border border-border/60 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <Icon className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" />
                        </div>
                        <div className="text-sm font-semibold">{p.label}</div>
                        <div className="text-[10px] text-primary/80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-2 font-medium">
                          Configure <Plus className="h-3 w-3" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>

        {/* ── Add-key Sheet Overlay ── */}
        <Sheet open={!!addingProvider} onOpenChange={(o) => !o && setAddingProvider(null)}>
          <SheetContent className="sm:max-w-md w-full p-0 flex flex-col">
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  {addingProvider ? (() => {
                    const Icon = PROVIDERS.find(p => p.id === addingProvider)?.icon || Key;
                    return <Icon className="h-5 w-5 text-primary" />;
                  })() : <Key className="h-5 w-5 text-primary" />}
                </div>
                <div className="flex-1 text-left">
                  <SheetTitle className="text-lg capitalize flex items-center gap-2">
                    {PROVIDERS.find(p => p.id === addingProvider)?.label || addingProvider}
                  </SheetTitle>
                  <SheetDescription>
                    Setup and configure your API key.
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="api-key"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      API Key
                    </Label>
                    {PROVIDERS.find((p) => p.id === addingProvider)?.docsUrl && (
                      <a
                        href={PROVIDERS.find((p) => p.id === addingProvider)?.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary flex items-center gap-1 hover:underline font-medium"
                      >
                        Get Key <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showKey ? "text" : "password"}
                      placeholder={PROVIDERS.find((p) => p.id === addingProvider)?.placeholder}
                      className="h-11 bg-muted/30 border-border/40 pr-10 focus-visible:ring-primary/50"
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="base-url"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Base URL (Optional)
                  </Label>
                  <Input
                    id="base-url"
                    placeholder="https://api.openai.com/v1"
                    className="h-11 bg-muted/30 border-border/40 focus-visible:ring-primary/50"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                  />
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 items-start">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600/90 leading-relaxed">
                    Your key is stored locally on this server and only used to
                    proxy requests to the provider. It is never shared with third parties.
                  </p>
                </div>
              </div>
            </ScrollArea>

            <div className="p-6 border-t bg-muted/10 flex flex-col gap-3">
              <Button
                variant="secondary"
                className="w-full gap-2 hover:bg-secondary/80"
                onClick={() => {
                  toast.info("Test connection initiated (requires backend validation endpoint)");
                  addKey(); // Temporarily maps to save to execute the same validation
                }}
                disabled={loading || !newKeyValue}
              >
                <RefreshCw className="h-4 w-4" /> Test Connection
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setAddingProvider(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={addKey}
                  disabled={loading || !newKeyValue}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save & Validate Key"
                  )}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Footer ── */}
        <div className="p-4 bg-muted/20 border-t border-border/40 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
            Status: Fully Encrypted
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-[10px] text-muted-foreground hover:text-foreground gap-1.5"
            onClick={fetchKeys}
          >
            <RefreshCw className="h-3 w-3" /> Refresh Status
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

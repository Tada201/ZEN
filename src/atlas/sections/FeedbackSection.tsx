import { useState } from "react";
import { AlertCircle, CheckCircle2, Info, Bell, Loader2, Megaphone, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DemoCard, Section } from "../Section";

export function FeedbackSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState(65);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [bannerVisible2, setBannerVisible2] = useState(true);

  const fakeSave = () =>
    new Promise<{ name: string }>((resolve, reject) => {
      const ok = Math.random() > 0.25;
      setTimeout(() => (ok ? resolve({ name: "settings.json" }) : reject(new Error("Network error"))), 1400);
    });

  return (
    <TooltipProvider>
      <Section id="feedback" title="Feedback & Overlays" description="Alerts, dialogs, toasts, tooltips, banners, and loaders.">
        <DemoCard
          label="Alerts"
          selection={{
            id: "f-alerts", name: "Alert Banners", category: "Feedback",
            variants: ["info", "success", "warning", "error"],
            jsx: `<Alert variant="destructive">\n  <AlertTitle>Error</AlertTitle>\n  <AlertDescription>Something went wrong.</AlertDescription>\n</Alert>`,
          }}
          className="md:col-span-2 xl:col-span-2"
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-2">
            {[
              { icon: Info, title: "Update available", desc: "A new version of UI Zen is ready.", cls: "border-primary/20 bg-primary/5 text-primary" },
              { icon: CheckCircle2, title: "Changes saved", desc: "Your preferences have been updated.", cls: "border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]" },
              { icon: AlertCircle, title: "Connection lost", desc: "Please check your network and try again.", cls: "border-destructive/20 bg-destructive/5 text-destructive" },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} role="alert" className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${a.cls}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="opacity-80 text-xs">{a.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </DemoCard>

        <DemoCard
          label="Dismissible banners"
          selection={{
            id: "f-banner", name: "Announcement Banners", category: "Feedback",
            variants: ["info", "promotional"],
            jsx: `{visible && (\n  <div role="banner" className="flex items-center gap-3 rounded-lg border bg-primary/5 px-4 py-3">\n    <Megaphone />\n    <p>New release: v2.0 is here!</p>\n    <button onClick={() => setVisible(false)}><X /></button>\n  </div>\n)}`,
          }}
          className="md:col-span-2 xl:col-span-2"
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-2">
            {bannerVisible && (
              <div role="banner" className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Megaphone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="flex-1 text-sm"><span className="font-semibold text-foreground">New: </span><span className="text-muted-foreground">UI Zen v2.0 is here — gradient tokens, 3D lab, and more.</span></p>
                <a href="#" onClick={(e) => e.preventDefault()} className="text-xs font-medium text-primary underline-offset-4 hover:underline shrink-0">What's new</a>
                <button
                  aria-label="Dismiss announcement"
                  onClick={() => setBannerVisible(false)}
                  className="press ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {bannerVisible2 && (
              <div role="banner" className="flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-4 py-3">
                <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <p className="flex-1 text-sm text-amber-700 dark:text-amber-300">Your free trial ends in <span className="font-semibold">3 days</span>. Upgrade to keep access.</p>
                <Button size="sm" className="press h-7 shrink-0 bg-amber-500 text-white hover:bg-amber-600">Upgrade</Button>
                <button
                  aria-label="Dismiss"
                  onClick={() => setBannerVisible2(false)}
                  className="press ml-0.5 rounded p-0.5 text-amber-500 hover:bg-amber-500/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!bannerVisible && !bannerVisible2 && (
              <button
                onClick={() => { setBannerVisible(true); setBannerVisible2(true); }}
                className="press w-full rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground hover:bg-muted"
              >
                Reset banners
              </button>
            )}
          </div>
        </DemoCard>

        <DemoCard
          label="Tooltips"
          selection={{
            id: "f-tooltip", name: "Tooltips", category: "Feedback",
            variants: ["simple", "with shortcut", "side variants"],
            jsx: `<Tooltip>\n  <TooltipTrigger asChild><Button>Hover me</Button></TooltipTrigger>\n  <TooltipContent>Tooltip content</TooltipContent>\n</Tooltip>`,
          }}
          className="md:col-span-2 xl:col-span-2"
        >
          <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center justify-center gap-4 py-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="press">Simple</Button>
              </TooltipTrigger>
              <TooltipContent>Hover me to see a tooltip</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="press"><Trash2 className="h-4 w-4" /> Delete</Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="flex items-center gap-2">
                Delete item
                <span className="rounded border border-white/20 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]">⌫</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="press">Bottom</Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">I appear below</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="press">Left</Button>
              </TooltipTrigger>
              <TooltipContent side="left">I appear on the left</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="press">Right</Button>
              </TooltipTrigger>
              <TooltipContent side="right">I appear on the right</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="press">Rich tooltip</Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] space-y-1 p-3">
                <p className="font-semibold">Keyboard shortcut</p>
                <p className="text-[11px] text-muted-foreground">Open the command palette to search components, themes, and actions.</p>
                <div className="flex gap-1 pt-0.5">
                  <span className="rounded border border-white/20 bg-muted/30 px-1 font-mono text-[10px]">⌘</span>
                  <span className="rounded border border-white/20 bg-muted/30 px-1 font-mono text-[10px]">K</span>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </DemoCard>

        <DemoCard
          label="Dialog"
          selection={{
            id: "f-dialog", name: "Dialog / Modal", category: "Feedback",
            variants: ["info", "form"],
            jsx: `<Dialog>\n  <DialogTrigger>Open</DialogTrigger>\n  <DialogContent>\n    <DialogHeader><DialogTitle>Confirm</DialogTitle></DialogHeader>\n  </DialogContent>\n</Dialog>`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <Button variant="outline" className="press" onClick={() => setDialogOpen(true)}>
                Open dialog
              </Button>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Invite a teammate</DialogTitle>
                  <DialogDescription>They will receive an email to join your workspace.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => { setDialogOpen(false); toast.success("Invitation sent"); }}>Send invite</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </DemoCard>

        <DemoCard
          label="Confirm destructive"
          selection={{
            id: "f-alert-dialog", name: "Alert Dialog (destructive)", category: "Feedback",
            variants: ["destructive"],
            jsx: `<AlertDialog>\n  <AlertDialogContent>\n    <AlertDialogTitle>Delete?</AlertDialogTitle>\n    <AlertDialogAction>Delete</AlertDialogAction>\n  </AlertDialogContent>\n</AlertDialog>`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="press">
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Delete project
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. All boards, members, and integrations will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => toast.success("Project deleted", { description: "You can restore it from Trash for 30 days." })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </DemoCard>

        <DemoCard
          label="Sheet / Drawer"
          selection={{
            id: "f-sheet", name: "Sheet (side drawer)", category: "Feedback",
            variants: ["right", "bottom"],
            jsx: `<Sheet>\n  <SheetTrigger>Open</SheetTrigger>\n  <SheetContent side="right">...</SheetContent>\n</Sheet>`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="press">Open settings</Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[320px] sm:w-[380px]">
                <SheetHeader>
                  <SheetTitle>Notification settings</SheetTitle>
                  <SheetDescription>Choose what you want to be notified about.</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-3 text-sm">
                  <p className="text-muted-foreground">Drawer content goes here. Try Esc to close, Tab to cycle.</p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </DemoCard>

        <DemoCard
          label="Toasts (Sonner)"
          selection={{
            id: "f-toasts", name: "Toast Notifications", category: "Feedback",
            variants: ["success", "error", "promise"],
            jsx: `import { toast } from "sonner";\n\ntoast.success("Saved");\ntoast.promise(saveFn(), { loading: "Saving…", success: "Saved", error: "Failed" });`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-2">
            <Button variant="outline" size="sm" className="press w-full"
              onClick={() => toast.success("Saved successfully", { description: "Your changes are live." })}>
              Trigger success
            </Button>
            <Button variant="outline" size="sm" className="press w-full"
              onClick={() => toast.error("Something went wrong", {
                description: "We could not reach the server.",
                action: { label: "Retry", onClick: () => toast.info("Retrying…") },
              })}>
              Trigger error (with action)
            </Button>
            <Button variant="outline" size="sm" className="press w-full"
              onClick={() =>
                toast.promise(fakeSave(), {
                  loading: "Saving…",
                  success: (r) => `Saved ${r.name}`,
                  error: (e) => (e instanceof Error ? e.message : "Save failed"),
                })
              }>
              Promise toast
            </Button>
          </div>
        </DemoCard>

        <DemoCard
          label="Progress"
          selection={{
            id: "f-progress", name: "Progress Bar", category: "Feedback",
            variants: ["determinate", "indeterminate"],
            jsx: `<Progress value={65} />`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <Progress value={progress} aria-label="Upload progress" />
            </div>
            <input
              type="range" min={0} max={100} value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Set progress value"
            />
          </div>
        </DemoCard>

        <DemoCard
          label="Skeleton"
          selection={{
            id: "f-skeleton", name: "Skeleton Loader", category: "Feedback",
            variants: ["text", "card", "avatar"],
            jsx: `<Skeleton className="h-4 w-[200px]" />\n<Skeleton className="h-12 w-12 rounded-full" />`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-3" aria-label="Loading content">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        </DemoCard>

        <DemoCard
          label="Empty state"
          selection={{
            id: "f-empty", name: "Empty State", category: "Feedback",
            variants: ["no-data", "no-results"],
            jsx: `<div className="text-center">\n  <div className="mx-auto h-12 w-12 rounded-full bg-muted" />\n  <h3>No results</h3>\n  <p>Try adjusting your filters.</p>\n</div>`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <h4 className="mt-3 text-sm font-medium">No notifications</h4>
            <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
              You are all caught up. New alerts will appear here.
            </p>
          </div>
        </DemoCard>

        <DemoCard
          label="Spinner"
          selection={{
            id: "f-spinner", name: "Loading Spinner", category: "Feedback",
            variants: ["default", "inline"],
            jsx: `<Loader2 className="h-5 w-5 animate-spin text-primary" />`,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-4 py-4" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
            <span className="sr-only">Loading</span>
          </div>
        </DemoCard>
      </Section>
    </TooltipProvider>
  );
}


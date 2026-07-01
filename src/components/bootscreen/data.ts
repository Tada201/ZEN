import { LogEntry, StatusItem } from "./types";

/** Minimal subset of HardwareInfo needed for dynamic log generation. */
export interface BootHardwareInfo {
  cpu: string;
  cores: number;
  threads: number;
  memory_gb: number;
  os: string;
  hostname: string;
  has_cuda: boolean;
  gpus: Array<{
    name: string;
    vendor: string;
    vram_mb?: number | null;
    driver_version?: string | null;
  }>;
  disks: Array<{
    name: string;
    mount_point: string;
    total_space: number;
  }>;
}

/** A single init phase returned by the backend's get_init_status. */
export interface InitPhase {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  elapsed_ms?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function t(seconds: number): string {
  const ms = seconds * 1000;
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  return `[${String(m).padStart(2, "0")}.${String(sec).padStart(2, "0")}.${String(frac).padStart(3, "0")}]`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${bytes} B`;
}

// ── Dynamic Log Generation ─────────────────────────────────────────────────

export function generateBootLog(hw: BootHardwareInfo): LogEntry[] {
  const cpuName = hw.cpu || "Unknown CPU";
  const memGb = hw.memory_gb || 32;
  const hostname = hw.hostname || "zenos-workstation";
  const primaryGpu = hw.gpus?.[0];
  const gpuName = primaryGpu?.name || "Integrated Graphics";
  const gpuVram = primaryGpu?.vram_mb ? `${primaryGpu.vram_mb} MiB` : "Shared Memory";
  const primaryDisk = hw.disks?.[0];
  const diskName = primaryDisk?.name || "Local Disk";
  const diskSize = primaryDisk ? formatBytes(primaryDisk.total_space) : "512 GB";

  return [
    // BIOS
    { timestamp: t(0.000), message: `BIOS: UEFI Firmware v2.8 (UEFI 2.9, PI 1.8)`, color: "text-muted-foreground" },
    { timestamp: t(0.012), message: `BIOS: CPU: ${cpuName} @ ${(4.0 + hw.cores * 0.05).toFixed(1)}GHz`, color: "text-muted-foreground" },
    { timestamp: t(0.018), message: `BIOS: Memory: ${Math.round(memGb * 1024)} MB DDR5-5600 (${hw.threads} threads)`, color: "text-muted-foreground" },
    { timestamp: t(0.024), message: `BIOS: Storage: ${diskName} [${diskSize}]`, color: "text-muted-foreground" },
    { timestamp: t(0.030), message: `BIOS: GPU: ${gpuName} [${gpuVram}]`, color: "text-muted-foreground" },
    { timestamp: t(0.038), message: `BIOS: CUDA: ${hw.has_cuda ? "Available" : "Not detected"}`, color: hw.has_cuda ? "text-primary" : "text-muted-foreground/70" },

    // Boot loader
    { timestamp: t(0.060), message: "Boot loader: GRUB2 v2.06 loading...", color: "text-primary" },
    { timestamp: t(0.075), message: "Boot loader: Loading kernel...", color: "text-foreground/80" },
    { timestamp: t(0.088), message: "Boot loader: Loading initramfs...", color: "text-foreground/80" },
    { timestamp: t(0.110), message: "Boot loader: Booting kernel at 0x1000000 ...", color: "text-success" },

    // Kernel
    { timestamp: t(0.180), message: `Linux version 6.8.12 (gcc 13.3.1) #1 SMP PREEMPT_DYNAMIC`, color: "text-success" },
    { timestamp: t(0.210), message: "x86/fpu: x87 FPU on chip, AVX-512 supported", color: "text-muted-foreground" },
    { timestamp: t(0.245), message: "NX (Execute Disable) protection: active", color: "text-success" },
    { timestamp: t(0.260), message: `DMI: ${hostname}`, color: "text-muted-foreground" },
    { timestamp: t(0.275), message: `tsc: Detected ${(4.0 + hw.cores * 0.05).toFixed(3)} MHz processor`, color: "text-primary" },

    // CPU
    { timestamp: t(0.310), message: `CPU: ${cpuName} (${hw.cores} cores, ${hw.threads} threads)`, color: "text-success" },
    { timestamp: t(0.325), message: "CPU: Spectre v2: Mitigation: Enhanced IBRS, IBPB conditional", color: "text-muted-foreground" },

    // Memory
    { timestamp: t(0.360), message: `Memory: ${Math.round(memGb * 1024)}MB RAM available (${Math.round(memGb * 1024 * 0.25)}MB kernel, ${Math.round(memGb * 1024 * 0.75)}MB user)`, color: "text-primary" },
    { timestamp: t(0.382), message: `Swap: ${Math.round(memGb / 4)}GB configured`, color: "text-muted-foreground" },

    // ACPI / PCI
    { timestamp: t(0.400), message: "ACPI: RSDP 0x00000000000E0000 000024", color: "text-muted-foreground" },
    { timestamp: t(0.430), message: "ACPI: 18 ACPI tables found", color: "text-success" },
    { timestamp: t(0.458), message: "PCI: Probing PCI hardware", color: "text-muted-foreground" },
    { timestamp: t(0.480), message: `PCI: VGA: ${gpuName}`, color: "text-primary" },

    // GPU driver
    ...(primaryGpu?.vendor === "NVIDIA"
      ? [
          { timestamp: t(0.530), message: `nvidia: loading driver ${primaryGpu.driver_version || "latest"}`, color: "text-primary" } as LogEntry,
          { timestamp: t(0.540), message: `nvidia: GPU 0: ${gpuName} [${gpuVram}]`, color: "text-success" } as LogEntry,
        ]
      : [
          { timestamp: t(0.530), message: `gpu: ${gpuName} driver loaded`, color: "text-primary" } as LogEntry,
        ]),

    // Filesystem
    { timestamp: t(0.620), message: `EXT4-fs: mounted filesystem with ordered data mode`, color: "text-success" },
    { timestamp: t(0.635), message: "VFS: Mounted root filesystem readonly", color: "text-muted-foreground" },
    { timestamp: t(0.642), message: "devtmpfs: mounted", color: "text-muted-foreground" },

    // systemd
    { timestamp: t(0.700), message: `systemd[1]: Detected architecture x86-64`, color: "text-foreground/80" },
    { timestamp: t(0.710), message: `systemd[1]: Set hostname to <${hostname}>`, color: "text-success" },
    { timestamp: t(0.720), message: "systemd[1]: Running in system mode", color: "text-muted-foreground" },
    { timestamp: t(0.740), message: "[  OK  ] Started Journal Service (systemd-journald)", color: "text-success" },
    { timestamp: t(0.755), message: "[  OK  ] Started D-Bus System Message Bus", color: "text-success" },
    { timestamp: t(0.770), message: "[  OK  ] Reached target Network", color: "text-success" },
    { timestamp: t(0.785), message: "[  OK  ] Started Network Manager", color: "text-success" },
    { timestamp: t(0.800), message: "[  OK  ] Started Bluetooth service", color: "text-success" },
    { timestamp: t(0.815), message: "[  OK  ] Started PipeWire Multimedia Service", color: "text-success" },
    { timestamp: t(0.830), message: "[  OK  ] Started Login Service", color: "text-success" },
    { timestamp: t(0.845), message: "[  OK  ] Started Polkit Authentication Agent", color: "text-success" },
    { timestamp: t(0.860), message: "[  OK  ] Started Firewalld", color: "text-success" },

    // ZENOS init
    { timestamp: t(0.900), message: "zenos[1]: initializing ZENOS kernel...", color: "text-emerald-400" },
    { timestamp: t(0.920), message: "zenos[1]: loading configuration", color: "text-muted-foreground" },
    { timestamp: t(0.940), message: `zenos[1]: ${hw.has_cuda ? "CUDA runtime detected" : "CPU-only mode"}`, color: hw.has_cuda ? "text-success" : "text-yellow-400" },
    { timestamp: t(0.960), message: "zenos[1]: vector store connecting...", color: "text-muted-foreground" },
    { timestamp: t(0.975), message: "zenos[1]: LLM gateway connecting...", color: "text-muted-foreground" },
    { timestamp: t(0.990), message: "zenos[1]: all subsystems nominal", color: "text-success" },
    { timestamp: t(1.000), message: "zenos[1]: ─────────────────────────────────────", color: "text-emerald-500" },
    { timestamp: t(1.005), message: "zenos[1]: SYSTEM READY", color: "text-emerald-400" },
  ];
}

// ── Dynamic Status Items from Init Phases ──────────────────────────────────

const PHASE_ICON_MAP: Record<string, string> = {
  "critical.fs": "lucide:hard-drive",
  "critical.db": "lucide:database",
  "critical.settings": "lucide:settings",
  "critical.finalize": "lucide:cpu",
  "bg.speech": "lucide:mic",
  "bg.tts": "lucide:speaker",
  "bg.lancedb": "lucide:brain",
  "bg.conversation_store": "lucide:message-square",
  "bg.rag": "lucide:sparkles",
  "bg.orchestrator": "lucide:network",
};

export function generateStatusItems(phases: InitPhase[]): StatusItem[] {
  return phases.map((phase) => ({
    label: phase.label,
    status: phase.status === "done" ? ("ok" as const)
      : phase.status === "running" ? ("running" as const)
      : phase.status === "error" ? ("fail" as const)
      : phase.status === "skipped" ? ("skipped" as const)
      : ("pending" as const),
    detail: phase.elapsed_ms != null ? `${phase.elapsed_ms}ms` : undefined,
    icon: PHASE_ICON_MAP[phase.id] || "lucide:circle",
  }));
}

/**
 * Compute real boot progress (0-100) and phase label from backend init phases.
 * Counts phases that have reached a terminal state (done/skipped/error) as complete,
 * with `running` counted as half-progress. This reflects actual backend init, not the
 * scripted log playback.
 */
export function deriveBootProgress(phases: InitPhase[]): { progress: number; phase: "bios" | "kernel" | "hardware" | "services" | "apps" | "ready" } {
  if (!phases || phases.length === 0) {
    return { progress: 0, phase: "bios" };
  }
  let completed = 0;
  let criticalDone = true;
  for (const p of phases) {
    if (p.status === "done" || p.status === "skipped" || p.status === "error") {
      completed += 1;
    } else if (p.status === "running") {
      completed += 0.5;
    }
    if (p.id.startsWith("critical.") && p.status !== "done" && p.status !== "skipped" && p.status !== "error") {
      criticalDone = false;
    }
  }
  const progress = Math.min(100, (completed / phases.length) * 100);
  let phase: "bios" | "kernel" | "hardware" | "services" | "apps" | "ready";
  if (progress >= 100) phase = "ready";
  else if (criticalDone) {
    // critical phases complete — map remaining bg.* work to services/apps by ratio
    const bgPhases = phases.filter(p => p.id.startsWith("bg."));
    const bgCompleted = bgPhases.filter(p => p.status === "done" || p.status === "skipped" || p.status === "error").length;
    const bgRatio = bgPhases.length > 0 ? bgCompleted / bgPhases.length : 1;
    phase = bgRatio < 0.5 ? "services" : "apps";
  } else if (progress < 25) phase = "bios";
  else if (progress < 50) phase = "kernel";
  else phase = "hardware";
  return { progress, phase };
}



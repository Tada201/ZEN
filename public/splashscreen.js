// ── Phase definitions matching src-tauri/src/commands/mod.rs ──
const phasesList = [
  { id: "critical.fs", label: "File System" },
  { id: "critical.db", label: "Database" },
  { id: "critical.settings", label: "Settings" },
  { id: "critical.finalize", label: "Services" },
  { id: "bg.speech", label: "Speech Engine" },
  { id: "bg.tts", label: "TTS Engine" },
  { id: "bg.lancedb", label: "Vector DB" },
  { id: "bg.conversation_store", label: "Conv Cache" },
  { id: "bg.rag", label: "RAG Embeddings" },
  { id: "bg.orchestrator", label: "Orchestrator" }
];

// ── DOM refs ──
const statusContainer = document.getElementById("status-container");
phasesList.forEach(phase => {
  const item = document.createElement("div");
  item.className = "status-item";
  item.id = `phase-${phase.id}`;
  item.innerHTML = `<span class="status-indicator status-pend">[  ]</span><span class="status-label">${phase.label}</span>`;
  statusContainer.appendChild(item);
});

const progressBar = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const phaseLabel = document.getElementById("init-phase-label");

// ── Helper: map phase status → CSS class + label ──
function indicatorClass(status) {
  if (status === "done" || status === "skipped") return "status-indicator status-ok";
  if (status === "running") return "status-indicator status-run";
  if (status === "error") return "status-indicator status-err";
  return "status-indicator status-pend";
}
function indicatorText(status) {
  if (status === "done") return "[OK]";
  if (status === "skipped") return "[--]";
  if (status === "running") return "[..]";
  if (status === "error") return "[!!]";
  return "[  ]";
}

// ── Render one polled snapshot ──
function renderStatus(status) {
  let completed = 0;
  let runningPhase = "bios";

  status.phases.forEach(phase => {
    const el = document.getElementById(`phase-${phase.id}`);
    if (!el) return;
    const indicator = el.querySelector(".status-indicator");
    indicator.className = indicatorClass(phase.status);
    indicator.textContent = indicatorText(phase.status);

    if (phase.status === "done" || phase.status === "skipped") {
      completed++;
    } else if (phase.status === "running") {
      completed += 0.5;
      runningPhase = phase.id;
    }
  });

  const pct = Math.round((completed / status.phases.length) * 100);
  progressBar.style.width = `${pct}%`;
  progressPercent.textContent = `${pct}%`;

  if (runningPhase.startsWith("critical.")) phaseLabel.textContent = "Booting Kernel";
  else if (runningPhase.startsWith("bg.")) phaseLabel.textContent = "Services Online";
  else if (pct >= 100) phaseLabel.textContent = "System Ready";
}

// ── Minimum splash display time (ms) ──
const MIN_SPLASH_MS = 2500;
const splashStart = performance.now();

let closeRequested = false;
function scheduleClose() {
  if (closeRequested) return;
  closeRequested = true;
  const elapsed = performance.now() - splashStart;
  const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
  setTimeout(() => {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) return;
    invoke("close_splashscreen").catch(() => {});
  }, remaining);
}

// ── Browser-only simulation fallback ──
function startSimulatedLoader() {
  let currentPct = 0;
  const simInterval = setInterval(() => {
    currentPct += 4;
    if (currentPct > 100) {
      clearInterval(simInterval);
      scheduleClose();
      return;
    }
    if (currentPct < 30) phaseLabel.textContent = "Initializing BIOS";
    else if (currentPct < 60) phaseLabel.textContent = "Mounting Kernel VFS";
    else if (currentPct < 90) phaseLabel.textContent = "Launching Services";
    else phaseLabel.textContent = "System Ready";
    progressBar.style.width = `${currentPct}%`;
    progressPercent.textContent = `${currentPct}%`;
    const itemIndex = Math.floor(currentPct / 10);
    if (itemIndex < phasesList.length) {
      const el = document.getElementById(`phase-${phasesList[itemIndex].id}`);
      if (el) {
        const indicator = el.querySelector(".status-indicator");
        indicator.className = "status-indicator status-ok";
        indicator.textContent = "[OK]";
      }
    }
  }, 150);
}

// ── Main: attempt real backend polling, fallback to simulation ──
const invoke = window.__TAURI_INTERNALS__?.invoke;
if (invoke) {
  let polledOnce = false;
  const pollTimer = setInterval(async () => {
    try {
      const status = await invoke("get_init_status");
      polledOnce = true;
      renderStatus(status);
      if (status.critical_complete) {
        clearInterval(pollTimer);
        scheduleClose();
      }
    } catch {
      if (!polledOnce) {
        clearInterval(pollTimer);
        startSimulatedLoader();
      }
    }
  }, 200);
  setTimeout(() => {
    if (!polledOnce) {
      clearInterval(pollTimer);
      startSimulatedLoader();
    }
  }, 10000);
} else {
  startSimulatedLoader();
}

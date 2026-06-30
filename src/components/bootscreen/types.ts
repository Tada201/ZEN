export interface BootMetrics {
  cpu_load: number;
  mem_used: number;
  mem_total: number;
  net_up: number;
  net_down: number;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  color?: string;
}

export interface StatusItem {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'warn' | 'fail' | 'skipped';
  detail?: string;
  icon?: string;
}

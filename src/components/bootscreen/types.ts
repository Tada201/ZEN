export interface LogEntry {
  timestamp: string;
  message: string;
  color?: string;
}

export interface StatusItem {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'warn' | 'fail';
  detail?: string;
}

export type PhoneStatus = 'pending' | 'running' | 'stopped' | 'restarting' | 'missing' | 'error';
export type PhoneAction = 'create' | 'start' | 'stop' | 'restart' | 'delete';

export interface Phone {
  id: string;
  machine_id: string;
  name: string;
  port: number;
  android: string;
  width: number;
  height: number;
  dpi: number;
  status: PhoneStatus;
  error: string | null;
  busy_action: PhoneAction | null;
  created_at: string;
}

export interface MachineInfo {
  agent?: string;
  os?: string;
  kernel?: string;
  cpus?: number;
  load1?: number;
  mem_total_mb?: number;
  mem_available_mb?: number;
  uptime_s?: number;
  docker?: string | false;
  binder?: boolean;
  adb?: boolean;
}

export interface Machine {
  id: string;
  name: string;
  stream_url: string | null;
  hostname: string | null;
  info: MachineInfo;
  last_seen: string | null;
  online: boolean;
  created_at: string;
  phones: Phone[];
}

export interface AppState {
  machines: Machine[];
}

export const ANDROID_VERSIONS = ['14', '13', '12', '11'] as const;

export const RESOLUTIONS = [
  { id: 'light', label: 'Ringan', width: 540, height: 960, dpi: 240, hint: '540 × 960, hemat RAM' },
  { id: 'standard', label: 'Standar', width: 720, height: 1280, dpi: 320, hint: '720 × 1280' },
  { id: 'hd', label: 'HD', width: 1080, height: 1920, dpi: 420, hint: '1080 × 1920' },
  { id: 'tall', label: 'Layar tinggi', width: 1080, height: 2400, dpi: 440, hint: '1080 × 2400' },
] as const;

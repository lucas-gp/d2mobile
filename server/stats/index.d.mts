export const LIMITS: Record<string, number>;
export const SITES: string[];
export interface Ping {
  id: string;
  playing: boolean;
  ver: string;
  site: string;
}
export function parsePing(raw: string): Ping;
export interface DayStats {
  day: string;
  active: number;
  new: number;
  returning: number;
  played: number;
  peak: number;
  peakPlaying: number;
  sessions: number;
  avgSessionSec: number;
}
export interface StatsReport {
  generatedAt: string;
  uniquePlayers: number;
  live: { concurrent: number; playing: number; menu: number };
  today: { day: string; active: number; new: number; returning: number; peak: number; peakPlaying: number };
  record: { peak: number; day: string | null; at: string | null };
  avgSessionSec30d: number;
  days: DayStats[];
  bySite: Record<string, number>;
  byVersion: Record<string, number>;
}
export function createStats(opts?: { file?: string; now?: () => number; limits?: Record<string, number> }): {
  record(p: Ping): { stored: boolean; isNew: boolean };
  stats(): StatsReport;
  purge(): number;
  backup(dest: string): void;
  close(): void;
  _db: import('node:sqlite').DatabaseSync;
};
export function createStatsServer(opts?: { adminToken?: string; dataFile?: string; limits?: Record<string, number>; now?: () => number; clientIp?: 'socket' | 'cloudflare'; trustedPeers?: string[] }): {
  server: import('node:http').Server;
  core: ReturnType<typeof createStats>;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
};
export function makeClientIp(o?: { mode?: string; peers?: string | string[] }): (req: import('node:http').IncomingMessage) => string;

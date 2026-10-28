export function itemProblem(item: unknown, limits?: Record<string, number>): string;
export const DEFAULT_RULESET: string;
export const LIMITS: Record<string, number>;
export function createGuildServer(opts?: { dataFile?: string; limits?: Record<string, number>; now?: () => number; clientIp?: 'socket' | 'cloudflare'; trustedPeers?: string[] }): {
  server: import('node:http').Server;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
};
export function makeClientIp(o?: { mode?: string; peers?: string | string[] }): (req: import('node:http').IncomingMessage) => string;

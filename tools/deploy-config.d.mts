export function buildVercelConfig(
  example: Record<string, unknown>,
  o: { isPublic: boolean; codeOnly: boolean; env: Record<string, string | undefined> },
): { rewrites?: { source: string; destination: string }[]; headers?: { source: string }[]; functions?: unknown; buildCommand?: string } & Record<string, unknown>;
export const VERCEL_CLI: string;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Parses a short duration string such as `15m`, `30d` or `900s` into seconds.
 *
 * The access-token TTL is configured in that notation (PRD 10.5) but the login response
 * has to report `expiresIn` as a number of seconds (PRD 8.2).
 */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) {
    throw new TypeError(`duration must look like "15m", "24h" or "30d", got "${value}"`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()];
}

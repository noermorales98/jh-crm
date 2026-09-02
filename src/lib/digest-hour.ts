export function isDigestHour(
  now: Date,
  timezone: string,
  digestHour: number,
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour === digestHour;
}

export function digestDedupeKey(
  organizationId: string,
  userId: string,
  now: Date,
  timezone: string,
): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `digest:${organizationId}:${userId}:${day}`;
}

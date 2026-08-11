export function widgetDayKey(timestampMs: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestampMs);
}

export function formatWidgetDay(
  timestampMs: number,
  locale: string,
  timeZone: string,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(timestampMs);
}

export function formatWidgetTime(
  timestampMs: number,
  locale: string,
  timeZone: string,
  includeDay = false,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...(includeDay ? { month: "short", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}

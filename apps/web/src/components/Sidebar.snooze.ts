import { useAppStore } from "@pi-web/client-runtime";

export interface SnoozePreset {
  readonly id: "later-today" | "tomorrow" | "next-week" | "one-hour";
  readonly label: string;
  readonly detail: string;
  readonly untilMs: number;
}

const SHORT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function isZhLocale(): boolean {
  try {
    return useAppStore.getState().locale === "zh-CN";
  } catch {
    return true;
  }
}

function atLocalHour(base: Date, daysFromBase: number, hour: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + daysFromBase,
    hour,
    0,
    0,
    0,
  );
}

function daysUntilNextMonday(dayOfWeek: number): number {
  const days = (8 - dayOfWeek) % 7;
  return days === 0 ? 7 : days;
}

export function resolveSnoozePresets(nowMs = Date.now()): ReadonlyArray<SnoozePreset> {
  const now = new Date(nowMs);
  const isZh = isZhLocale();
  const presets: SnoozePreset[] = [];

  const laterToday = now.getHours() < 12 ? atLocalHour(now, 0, 14) : atLocalHour(now, 0, 18);
  if (laterToday.getTime() - nowMs >= 30 * 60_000) {
    presets.push({
      id: "later-today",
      label: isZh ? "今天晚些时候" : "Later today",
      detail: TIME_FORMATTER.format(laterToday),
      untilMs: laterToday.getTime(),
    });
  }

  const tomorrow = atLocalHour(now, 1, 9);
  presets.push({
    id: "tomorrow",
    label: isZh ? "明天" : "Tomorrow",
    detail: `${SHORT_WEEKDAY_FORMATTER.format(tomorrow)} ${TIME_FORMATTER.format(tomorrow)}`,
    untilMs: tomorrow.getTime(),
  });

  const nextMonday = atLocalHour(now, daysUntilNextMonday(now.getDay()), 9);
  presets.push({
    id: "next-week",
    label: isZh ? "下周" : "Next week",
    detail: `${SHORT_WEEKDAY_FORMATTER.format(nextMonday)} ${TIME_FORMATTER.format(nextMonday)}`,
    untilMs: nextMonday.getTime(),
  });

  const oneHour = new Date(nowMs + 60 * 60_000);
  presets.push({
    id: "one-hour",
    label: isZh ? "1 小时后" : "In 1 hour",
    detail: TIME_FORMATTER.format(oneHour),
    untilMs: oneHour.getTime(),
  });

  return presets;
}

export function formatSnoozeWakeLabel(snoozedUntilMs: number, nowMs = Date.now()): string {
  const wakeDate = new Date(snoozedUntilMs);
  const isZh = isZhLocale();
  if (Number.isNaN(wakeDate.getTime())) return isZh ? "已延后" : "Snoozed";

  const now = new Date(nowMs);
  const startOfToday = atLocalHour(now, 0, 0).getTime();
  const startOfTomorrow = atLocalHour(now, 1, 0).getTime();
  const startOfDayAfterTomorrow = atLocalHour(now, 2, 0).getTime();
  const startOfWeekAhead = atLocalHour(now, 7, 0).getTime();
  const wakeMs = wakeDate.getTime();

  if (wakeMs >= startOfToday && wakeMs < startOfTomorrow) {
    return TIME_FORMATTER.format(wakeDate);
  }
  if (wakeMs >= startOfTomorrow && wakeMs < startOfDayAfterTomorrow) {
    return isZh
      ? `明天 ${TIME_FORMATTER.format(wakeDate)}`
      : `Tomorrow ${TIME_FORMATTER.format(wakeDate)}`;
  }
  if (wakeMs >= startOfDayAfterTomorrow && wakeMs < startOfWeekAhead) {
    return `${SHORT_WEEKDAY_FORMATTER.format(wakeDate)} ${TIME_FORMATTER.format(wakeDate)}`;
  }
  return SHORT_DATE_FORMATTER.format(wakeDate);
}

export function formatCompactRelativeTime(timestampMs: number, nowMs = Date.now()): string {
  const diffSeconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSeconds < 60) return isZhLocale() ? "刚刚" : "now";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatWorkingDuration(startedAtMs: number, nowMs = Date.now()): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

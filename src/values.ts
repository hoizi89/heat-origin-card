import type { HassEntity, HomeAssistant } from "./types";

const UNUSABLE = new Set(["unavailable", "unknown", "none", ""]);

export function isUsable(entity: HassEntity | undefined): entity is HassEntity {
  return Boolean(entity) && !UNUSABLE.has(String(entity!.state).toLowerCase());
}

export function stateOf(hass: HomeAssistant | undefined, entityId: string | undefined): HassEntity | undefined {
  if (!hass || !entityId) return undefined;
  return hass.states[entityId];
}

export function numberOf(entity: HassEntity | undefined): number | undefined {
  if (!isUsable(entity)) return undefined;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : undefined;
}

export function unitOf(entity: HassEntity | undefined): string {
  return String(entity?.attributes?.unit_of_measurement ?? "");
}

/** Power in kilowatts, whatever unit the sensor reports. */
export function powerKw(entity: HassEntity | undefined): number | undefined {
  const value = numberOf(entity);
  if (value === undefined) return undefined;
  return scalePower(value, unitOf(entity));
}

export function scalePower(value: number, unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u === "w") return value / 1000;
  if (u === "mw") return value * 1000;
  return value;
}

/** Energy in kilowatt hours, whatever unit the sensor reports. */
export function energyKwh(entity: HassEntity | undefined): number | undefined {
  const value = numberOf(entity);
  if (value === undefined) return undefined;
  const u = unitOf(entity).trim().toLowerCase();
  if (u === "wh") return value / 1000;
  if (u === "mwh") return value * 1000;
  return value;
}

export function localeOf(hass: HomeAssistant | undefined): string {
  return hass?.locale?.language ?? hass?.language ?? "en";
}

export function formatNumber(value: number, locale: string, digits: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

/** A temperature to one decimal, the way a thermometer reads. */
export function formatTemp(value: number, locale: string): string {
  return formatNumber(value, locale, 1);
}

/** Kilowatts: two decimals under ten, one above, so 1,73 and 12,4 both read naturally. */
export function formatPower(value: number, locale: string): string {
  return formatNumber(value, locale, Math.abs(value) < 10 ? 2 : 1);
}

export function formatEnergy(value: number, locale: string): string {
  return formatNumber(value, locale, Math.abs(value) < 10 ? 2 : 1);
}

/** Minutes as "1 h 59 min", "16 min" or "30 s". */
export function formatSpan(minutes: number): { hours?: number; minutes?: number; seconds?: number } {
  if (minutes < 1) return { seconds: Math.max(0, Math.round(minutes * 60)) };
  const rounded = Math.round(minutes);
  if (rounded < 60) return { minutes: rounded };
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

export function clock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

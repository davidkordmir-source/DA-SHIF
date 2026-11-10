import lunarData from "../data/iran-lunar.json";
import eventsData from "../data/iran-events.json";

export const CALENDAR_REVISION = lunarData.revision;
export const CALENDAR_UPDATED_AT = lunarData.updatedAt;
export const CALENDAR_VALID_FROM = lunarData.validFrom;
export const CALENDAR_VALID_UNTIL = lunarData.validUntil;
export const CALENDAR_ANNUAL_YEAR = lunarData.annualCalendarYear;
export const IRAN_EVENTS = eventsData.events;
export function hasIranCalendar(date: string) {
  return date >= CALENDAR_VALID_FROM && date <= CALENDAR_VALID_UNTIL;
}
// The table contains observed/published Iranian month starts, rather than a
// repeating arithmetic 30/29-day pattern or Saudi Umm al-Qura dates.
export function iranLunar(
  date: string,
): { year: number; month: number; day: number } | null {
  if (!hasIranCalendar(date)) return null;
  const starts = lunarData.monthStarts;
  let low = 0,
    high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (String(starts[middle][2]) <= date) low = middle;
    else high = middle - 1;
  }
  const [year, month, start] = starts[low];
  return {
    year: Number(year),
    month: Number(month),
    day:
      Math.round(
        (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
          86400000,
      ) + 1,
  };
}

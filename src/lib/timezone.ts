/**
 * Timezone helpers shared between the frontend and the database.
 *
 * The frontend writes `check_in_date` as the browser-local
 * `yyyy-MM-dd` for the day the user clicked the check-in
 * button. The database (migration 003) computes "today" using
 * `profiles.timezone`, so the user's IANA timezone must be
 * captured at signup and stored on the profile.
 *
 * If a user travels across timezones, their stored profile
 * timezone may differ from their current browser timezone.
 * The browser-local date is still written to the database;
 * the database's "today" calculation may then disagree with
 * the date the user wrote. This is a known v1 limitation.
 */

export type IanaTimezone = string

/**
 * Returns the browser's IANA timezone, e.g.
 * "America/New_York", "Australia/Sydney", "UTC".
 * Falls back to "UTC" if the runtime doesn't expose
 * Intl.DateTimeFormat().resolvedOptions().timeZone.
 */
export function getBrowserTimezone(): IanaTimezone {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && typeof tz === 'string' && tz.length > 0) return tz
  } catch {
    // Intl not available; fall through to UTC.
  }
  return 'UTC'
}

/**
 * Returns the calendar date `yyyy-MM-dd` for "now" in the
 * given IANA timezone. The DB will compute the same value
 * via `((now() at time zone tz)::date)`.
 *
 * @param tz - IANA timezone string (e.g., "America/New_York")
 * @param date - Optional Date object to convert (defaults to now)
 */
export function todayInTimezone(tz: IanaTimezone, date: Date = new Date()): string {
  // Intl.DateTimeFormat with timeZone option gives a reliable,
  // locale-independent yyyy-MM-dd for the given zone.
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
    const m = parts.find((p) => p.type === 'month')?.value ?? '01'
    const d = parts.find((p) => p.type === 'day')?.value ?? '01'
    return `${y}-${m}-${d}`
  } catch {
    // Unknown tz name; fall back to local date.
    return formatLocalDate(date)
  }
}

/**
 * Returns the local `yyyy-MM-dd` for the given Date object
 * in the runtime's local timezone. This is what the user
 * "sees" as today in the browser, and what we historically
 * wrote to `check_in_date` before migration 003.
 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

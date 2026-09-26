// Decent hours for anything leaving the building: 9am–8pm IST, Monday–Saturday.
const IST = 330 * 60_000;
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 20;

/** Is `now` inside 9:00–20:00 IST on a Monday–Saturday? */
export function isOpenHours(now: Date): boolean {
  const ist = new Date(now.getTime() + IST);
  const h = ist.getUTCHours();
  return ist.getUTCDay() !== 0 && h >= OPEN_HOUR && h < CLOSE_HOUR;
}

/** `now` if open, else the next 9:00 IST on a Monday–Saturday. */
export function nextOpenSlot(now: Date): Date {
  if (isOpenHours(now)) return now;
  const ist = new Date(now.getTime() + IST);
  let day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  if (ist.getUTCHours() >= CLOSE_HOUR || ist.getUTCDay() === 0) day += 86_400_000;
  while (new Date(day).getUTCDay() === 0) day += 86_400_000;
  return new Date(day + OPEN_HOUR * 3600_000 - IST);
}

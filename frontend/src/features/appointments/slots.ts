// Fixed one-hour slots a staff member can pick from. Custom times are typed in the form.
export const FIXED_SLOT_STARTS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

// A time-of-day string as "HH:MM" plus one hour, for the slot picker's default end.
export function addOneHour(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${String(hour + 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Local midnight of the chosen day and of the next day: the API takes instants, the day is the user's.
export function dayRange(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export function instantOn(day: string, time: string): Date {
  return new Date(`${day}T${time}`);
}

// Returns a message key-friendly reason, or null when the range is acceptable.
// A range must end after it starts, and both ends must fall on the chosen day (spec A2).
export function rangeProblem(
  day: string,
  start: Date,
  end: Date,
): "END_BEFORE_START" | "OTHER_DAY" | null {
  if (end.getTime() <= start.getTime()) return "END_BEFORE_START";
  const { from, to } = dayRange(day);
  if (start < from || end > to) return "OTHER_DAY";
  return null;
}

export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

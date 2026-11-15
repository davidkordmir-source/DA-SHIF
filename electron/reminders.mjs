// Shared by the native background timer and browser fallback. All times refer
// to Tehran, regardless of the host machine's timezone.
export function dueReminders(data, now = new Date()) {
  const reminder = data?.reminder;
  if (
    !reminder?.enabled ||
    !reminder.scheduleId ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time) ||
    !Number.isInteger(reminder.daysBefore) ||
    reminder.daysBefore < 0 ||
    reminder.daysBefore > 7
  )
    return [];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type)?.value;
  if (`${part("hour")}:${part("minute")}` < reminder.time) return [];
  const target = new Date(
    `${part("year")}-${part("month")}-${part("day")}T12:00:00Z`,
  );
  target.setUTCDate(target.getUTCDate() + reminder.daysBefore);
  const date = target.toISOString().slice(0, 10);
  let schedule = (data.schedules || []).find(
    (s) => s.id === reminder.scheduleId,
  );
  const shift = (data.shifts || []).find((s) => {
    if (s.date !== date) return false;
    if (schedule) return s.scheduleId === schedule.id;
    if (s.scheduleId || !reminder.scheduleId.startsWith("legacy:"))
      return false;
    const j = new Intl.DateTimeFormat("en-u-ca-persian", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
    }).formatToParts(new Date(`${date}T12:00:00Z`));
    return (
      reminder.scheduleId ===
      `legacy:${j.find((p) => p.type === "year").value}-${Number(j.find((p) => p.type === "month").value)}`
    );
  });
  if (!shift) return [];
  if (!schedule) schedule = { name: "برنامهٔ شیفت", location: "" };
  const names = (ids) =>
    ids
      .map((id) => data.people?.find((p) => p.id === id)?.name || id)
      .join("، ");
  return [
    {
      key: `${reminder.scheduleId}|${date}|${reminder.daysBefore}|${reminder.time}`,
      title: `یادآوری ${schedule.name}`,
      body: `${new Intl.DateTimeFormat("fa-IR", { timeZone: "UTC", dateStyle: "full" }).format(new Date(`${date}T12:00:00Z`))}${schedule.location ? ` · ${schedule.location}` : ""}\nاصلی: ${names(shift.primary)}\nرزرو: ${names(shift.reserve)}`,
    },
  ];
}

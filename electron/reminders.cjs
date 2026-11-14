const fs = require("node:fs");
const path = require("node:path");

// Win32 toasts are associated with the installed Start Menu shortcut's AUMID.
// The custom NSIS installer creates the shortcut; Electron adds its identity.
function ensureNotificationShortcut({
  appData,
  executable,
  writeShortcutLink,
}) {
  const shortcut = path.join(
    appData,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Hamshift",
    "هم‌شیفت.lnk",
  );
  fs.mkdirSync(path.dirname(shortcut), { recursive: true });
  return writeShortcutLink(
    shortcut,
    fs.existsSync(shortcut) ? "update" : "create",
    {
      target: executable,
      cwd: path.dirname(executable),
      icon: executable,
      iconIndex: 0,
      description: "هم‌شیفت — مدیریت شیفت پرسنل",
      appUserModelId: "ir.hamshift.desktop",
    },
  );
}

function tehranClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}
function reminderPayload(data, now = new Date()) {
  const { date } = tehranClock(now);
  const shifts = (data?.shifts || []).filter(
    (s) =>
      s.date === date &&
      !data.scheduleLists?.some(
        (list) => list.id === s.listId && list.mode === "alternative",
      ),
  );
  if (!shifts.length) return null;
  const name = (id) => data.people.find((p) => p.id === id)?.name || id;
  const lines = shifts.map((s) => {
    const actualName = (id) => {
      const a = s.attendance?.find(
        (a) => a.personId === id && a.status !== "present",
      );
      return a
        ? a.replacementId
          ? `${name(a.replacementId)} (جایگزین ${name(id)})`
          : `${name(id)} (غایب)`
        : name(id);
    };
    return [
      s.listId
        ? `فهرست: ${data.scheduleLists?.find((list) => list.id === s.listId)?.name || "بدون نام"}`
        : "",
      s.startTime
        ? `${s.startTime} تا ${s.endTime}${s.endTime <= s.startTime ? " روز بعد" : ""}`
        : "تمام روز",
      s.leaders?.length
        ? `مسئول شب: ${s.leaders.map(actualName).join("، ")}`
        : "",
      `همراه${s.leaders ? "" : " / اصلی"}: ${
        s.primary
          .filter((id) => !s.leaders?.includes(id))
          .map(actualName)
          .join("، ") || "—"
      }`,
      `رزرو: ${s.reserve.map(name).join("، ") || "—"}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return {
    title: "هم‌شیفت · نفرات شیفت امروز",
    body: lines.join("\n\n"),
    date,
  };
}
function createReminderService({
  directory,
  getData,
  show,
  now = () => new Date(),
}) {
  const file = path.join(directory, "hamshift-reminder-state.json");
  let lastKey = "",
    timer;
  try {
    lastKey = JSON.parse(fs.readFileSync(file, "utf8")).lastKey || "";
  } catch {
    /* First run. */
  }
  const tick = () => {
    const data = getData(),
      settings = data?.reminder;
    if (!settings?.enabled || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time))
      return false;
    const clock = tehranClock(now()),
      key = `${clock.date}/${settings.time}`;
    if (clock.time < settings.time || key === lastKey) return false;
    const payload = reminderPayload(data, now());
    if (!payload || show(payload) === false) return false;
    lastKey = key;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify({ lastKey }), {
      mode: 0o600,
    });
    fs.renameSync(file + ".tmp", file);
    return true;
  };
  return {
    tick,
    start() {
      if (!timer) {
        timer = setInterval(() => {
          try {
            tick();
          } catch (e) {
            console.error("Reminder failed:", e.message);
          }
        }, 20000);
        timer.unref();
      }
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
    test() {
      const payload = reminderPayload(getData(), now()) || {
        title: "هم‌شیفت · اعلان آزمایشی",
        body: "یادآور آماده است. برای امروز هنوز شیفتی ثبت نشده است.",
      };
      return show(payload) !== false;
    },
  };
}
module.exports = {
  tehranClock,
  reminderPayload,
  createReminderService,
  ensureNotificationShortcut,
};

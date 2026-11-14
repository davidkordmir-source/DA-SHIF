const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createReminderService,
  reminderPayload,
  tehranClock,
  ensureNotificationShortcut,
} = require("./reminders.cjs");

test("the installed Start Menu shortcut receives the same Windows notification identity as the app", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "hamshift-shortcut-"),
  );
  try {
    const calls = [],
      executable = path.join(directory, "install", "Hamshift.exe");
    const register = () =>
      ensureNotificationShortcut({
        appData: directory,
        executable,
        writeShortcutLink: (file, operation, options) => {
          calls.push({ file, operation, options });
          fs.writeFileSync(file, "shortcut fixture");
          return true;
        },
      });
    assert.equal(register(), true);
    assert.equal(calls[0].operation, "create");
    assert.equal(calls[0].options.appUserModelId, "ir.hamshift.desktop");
    assert.equal(calls[0].options.target, executable);
    assert.match(calls[0].file, /Start Menu/);
    assert.equal(register(), true);
    assert.equal(calls[1].operation, "update");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const data = () => ({
  people: [
    { id: "1", name: "مسئول" },
    { id: "2", name: "همراه" },
    { id: "3", name: "رزرو" },
  ],
  shifts: [
    {
      date: "2026-11-14",
      startTime: "20:00",
      endTime: "08:00",
      primary: ["1", "2"],
      leaders: ["1"],
      reserve: ["3"],
      attendance: [],
    },
  ],
  reminder: { enabled: true, time: "18:00", runAtLogin: false },
});
test("notifications name real locations and leave alternative proposals out", () => {
  const current = data();
  current.scheduleLists = [
    { id: "a", name: "مرکزی", mode: "parallel" },
    { id: "b", name: "پیشنهاد دوم", mode: "alternative" },
  ];
  current.shifts = current.scheduleLists.map((list) => ({
    ...current.shifts[0],
    listId: list.id,
  }));
  const payload = reminderPayload(current, new Date("2026-11-14T14:30:00Z"));
  assert.match(payload.body, /فهرست: مرکزی/);
  assert.doesNotMatch(payload.body, /پیشنهاد دوم/);
});
test("reminders use Tehran time and show every hourly slot, actual replacement and role", () => {
  const now = new Date("2026-11-14T14:30:00Z");
  assert.deepEqual(tehranClock(now), { date: "2026-11-14", time: "18:00" });
  const d = data();
  d.shifts[0].attendance = [
    { personId: "1", status: "excused", replacementId: "3" },
  ];
  d.shifts.push({ ...d.shifts[0], startTime: "10:00", endTime: "12:00" });
  const message = reminderPayload(d, now);
  assert.match(message.body, /مسئول شب: رزرو \(جایگزین مسئول\)/);
  assert.match(message.body, /همراه: همراه/);
  assert.match(message.body, /20:00 تا 08:00 روز بعد/);
  assert.match(message.body, /10:00 تا 12:00/);
});
test("sends once after the selected hour, persists deduplication and catches up after restart", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "hamshift-reminder-"),
  );
  try {
    let now = new Date("2026-11-14T14:29:00Z"),
      sent = [];
    const config = {
      directory,
      getData: data,
      show: (message) => sent.push(message),
      now: () => now,
    };
    const first = createReminderService(config);
    assert.equal(first.tick(), false);
    now = new Date("2026-11-14T14:30:00Z");
    assert.equal(first.tick(), true);
    assert.equal(first.tick(), false);
    const restarted = createReminderService(config);
    assert.equal(restarted.tick(), false);
    assert.equal(sent.length, 1);
    const otherDirectory = path.join(directory, "late-start");
    const late = createReminderService({
      ...config,
      directory: otherDirectory,
    });
    now = new Date("2026-11-14T20:00:00Z");
    assert.equal(late.tick(), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("disabled, empty-day and failed native notifications do not consume a notification", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "hamshift-reminder-"),
  );
  try {
    let current = data(),
      supported = false,
      count = 0;
    const service = createReminderService({
      directory,
      getData: () => current,
      now: () => new Date("2026-11-14T14:30:00Z"),
      show: () => {
        count++;
        return supported;
      },
    });
    current.reminder.enabled = false;
    assert.equal(service.tick(), false);
    assert.equal(count, 0);
    current.reminder.enabled = true;
    assert.equal(service.tick(), false);
    assert.equal(count, 1);
    supported = true;
    assert.equal(service.tick(), true);
    assert.equal(count, 2);
    current.shifts = [];
    assert.equal(
      reminderPayload(current, new Date("2026-11-14T14:30:00Z")),
      null,
    );
    assert.equal(service.test(), true);
    assert.equal(count, 3);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

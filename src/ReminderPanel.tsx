import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import type { AppData, ShiftReminder } from "./types";
import { Field, Notice, Select } from "./components";
import { fa, solarLabel } from "./lib/calendar";
import { scheduleLists } from "./lib/schedules";
import { dueReminders } from "../electron/reminders.mjs";

export function ReminderPanel({
  data,
  onSave,
}: {
  data: AppData;
  onSave: (data: AppData, message: string) => boolean;
}) {
  const [form, setForm] = useState<ShiftReminder>(
    data.reminder || {
      enabled: false,
      scheduleId: "",
      time: "08:00",
      daysBefore: 1,
    },
  );
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (window.desktop)
      window.desktop
        .reminderStatus()
        .then(setSupported)
        .catch(() => setSupported(false));
  }, []);
  const lists = scheduleLists(data);
  const selected = lists.find((s) => s.id === form.scheduleId);
  return (
    <section className="panel settings-panel reminder-panel">
      <div className="settings-title">
        <Bell size={21} />
        <div>
          <h2>یادآوری شیفت</h2>
          <p>اعلان فقط برای فهرست انتخاب‌شده ارسال می‌شود.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.enabled && !selected) return;
          onSave({ ...data, reminder: form }, "تنظیمات یادآوری ذخیره شد.");
        }}
      >
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          یادآوری شیفت فعال باشد
        </label>
        <div className="form-grid">
          <Field label="فهرست شیفت برای اعلان">
            <Select
              required={form.enabled}
              value={form.scheduleId}
              onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
            >
              <option value="">انتخاب فهرست شیفت‌بندی</option>
              {lists.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="زمان اعلان (به وقت تهران)">
            <input
              required
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
          <Field label="زمان یادآوری نسبت به شیفت">
            <Select
              value={form.daysBefore}
              onChange={(e) =>
                setForm({ ...form, daysBefore: +e.target.value })
              }
            >
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>
                  {i ? `${fa(i)} روز قبل` : "همان روز"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {selected && (
          <p className="body-text">
            {selected.name} · {solarLabel(selected.startDate)} تا{" "}
            {solarLabel(selected.endDate)}
            {selected.location ? ` · ${selected.location}` : ""}
          </p>
        )}
        <Notice>
          برای دریافت یادآوری، نرم‌افزار باید باز باشد؛ کوچک‌کردن پنجره مانعی
          ندارد. پس از زمان انتخاب‌شده، اعلان همان روز در اولین فرصت نمایش داده
          می‌شود. برنامه در حالت بسته یا خاموشی دستگاه اعلان ارسال نمی‌کند.
        </Notice>
        {!window.desktop && (
          <Notice>
            در نسخهٔ مرورگر، یادآوری داخل برنامه نمایش داده می‌شود؛ برای اعلان
            سیستم‌عامل از نسخهٔ دسکتاپ استفاده کنید.
          </Notice>
        )}
        {supported === false && (
          <Notice warning>
            اعلان سیستم‌عامل در این دستگاه در دسترس نیست؛ یادآوری داخل برنامه
            همچنان نمایش داده می‌شود.
          </Notice>
        )}
        <button
          className="button button-primary"
          disabled={form.enabled && !selected}
        >
          <Bell size={16} />
          ذخیرهٔ یادآوری
        </button>
      </form>
    </section>
  );
}

export function useShiftReminder(
  data: AppData,
  notify: (message: string) => void,
) {
  useEffect(() => {
    const check = () => {
      for (const item of dueReminders(data)) {
        try {
          const key = `hamshift:reminder:${item.key}`;
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "1");
          notify(`${item.title} — ${item.body}`);
        } catch {
          /* Storage errors are reported by the main application. */
        }
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [data.reminder, data.shifts, data.schedules, data.people]);
}

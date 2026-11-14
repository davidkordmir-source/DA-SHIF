import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { AppData } from "./types";
import { Badge, Empty, Field, Notice } from "./components";
import { fa, parseSolarInput, solarInput, solarLabel } from "./lib/calendar";
import { exportSchedule } from "./lib/excel";
import {
  primaryRole,
  reserveQueue,
  shiftKey,
  shiftTimeLabel,
  listName,
} from "./lib/shift-utils";
import { renameScheduleList } from "./lib/planning";

export function HistoryPanel({
  data,
  onDay,
  onEdit,
  notify,
  onSave,
}: {
  data: AppData;
  onDay: (date: string, listId?: string) => void;
  onEdit: (key: string) => void;
  notify: (message: string) => void;
  onSave: (next: AppData) => boolean;
}) {
  const [planId, setPlanId] = useState("");
  const [listId, setListId] = useState("");
  const [newName, setNewName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const name = (id: string) => data.people.find((p) => p.id === id)?.name || id;
  let error = "",
    start = "",
    end = "";
  try {
    if (from) start = parseSolarInput(from);
    if (to) end = parseSolarInput(to);
    if (start && end && end < start) error = "تاریخ پایان پیش از شروع است.";
  } catch {
    error = "تاریخ فیلتر را به صورت سال/ماه/روز وارد کنید.";
  }
  const plan = data.plans?.find((p) => p.id === planId);
  const selectedList = data.scheduleLists?.find((list) => list.id === listId);
  const shifts = data.shifts.filter(
    (s) =>
      (!plan || plan.shiftIds.includes(shiftKey(s))) &&
      (!listId || (listId === "legacy" ? !s.listId : s.listId === listId)) &&
      (!start || s.date >= start) &&
      (!end || s.date <= end) &&
      (!query ||
        [...s.primary, ...s.reserve].some((id) =>
          `${name(id)} ${id}`.includes(query),
        )),
  );
  const pages = Math.ceil(shifts.length / 40);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const warnings = plan ? data.schedulingWarnings?.[plan.id] || [] : [];
  return (
    <section className="panel history-panel">
      <div className="section-toolbar">
        <div>
          <h2>
            <CalendarRange size={20} /> تاریخچهٔ همهٔ برنامه‌ها
          </h2>
          <p>
            همهٔ سال‌ها، نوبت‌های ساعتی و ویرایش‌های دستی در این بخش می‌مانند.
          </p>
        </div>
        <Badge tone="blue">{fa(data.shifts.length)} نوبت</Badge>
      </div>
      <div className="history-filters">
        <Field label="فهرست تاریخچه">
          <select
            value={listId}
            onChange={(e) => {
              setListId(e.target.value);
              setPlanId("");
              setPage(0);
              setNewName(
                data.scheduleLists?.find((list) => list.id === e.target.value)
                  ?.name || "",
              );
            }}
          >
            <option value="">همهٔ موقعیت‌ها</option>
            {data.shifts.some((s) => !s.listId) && (
              <option value="legacy">فهرست قبلی</option>
            )}
            {data.scheduleLists?.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} · {list.mode === "parallel" ? "اجرایی" : "پیشنهادی"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="انتخاب برنامه">
          <select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">همهٔ برنامه‌ها و سوابق قبلی</option>
            {data.plans
              ?.filter(
                (p) =>
                  !listId ||
                  (listId === "legacy" ? !p.listId : p.listId === listId),
              )
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title} · {fa(solarInput(p.startDate))} تا{" "}
                  {fa(solarInput(p.endDate))}
                </option>
              ))}
          </select>
        </Field>
        <Field label="از تاریخ شمسی">
          <input
            value={from}
            dir="ltr"
            placeholder="همهٔ تاریخ‌ها"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="تا تاریخ شمسی">
          <input
            value={to}
            dir="ltr"
            placeholder="همهٔ تاریخ‌ها"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="جست‌وجوی فرد در تاریخچه">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="نام یا کد"
          />
        </Field>
      </div>
      {selectedList && (
        <form
          className="list-rename"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onSave(renameScheduleList(data, selectedList.id, newName));
            } catch (error) {
              notify((error as Error).message);
            }
          }}
        >
          <Field label="ویرایش نام فهرست">
            <input
              required
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <button type="submit" className="button button-secondary">
            ذخیرهٔ نام فهرست
          </button>
          <Badge tone={selectedList.mode === "alternative" ? "amber" : "green"}>
            {selectedList.mode === "alternative"
              ? "چیدمان پیشنهادی مستقل"
              : "موقعیت اجرایی هم‌زمان"}
          </Badge>
        </form>
      )}
      {error && (
        <div role="alert" className="error-text">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <Notice warning>
          در این برنامه {fa(warnings.length)} مورد کمبود استراحت ثبت شده است.
          <details>
            <summary>نمایش هشدارها</summary>
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </details>
        </Notice>
      )}
      <div className="section-toolbar">
        <span>{fa(shifts.length)} نوبت در نتیجه</span>
        <button
          className="button button-secondary"
          disabled={exporting || !shifts.length || !!error}
          onClick={async () => {
            setExporting(true);
            try {
              await exportSchedule(
                { ...data, shifts },
                [...new Set(shifts.map((s) => s.date))].sort(),
              );
            } catch {
              notify("خروجی اکسل انجام نشد.");
            } finally {
              setExporting(false);
            }
          }}
        >
          <ArrowDownToLine size={16} />
          خروجی اکسل تاریخچه
        </button>
      </div>
      {shifts.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>فهرست / موقعیت</th>
                <th>تاریخ و نوبت</th>
                <th>مسئول شب</th>
                <th>همراه / اصلی قبلی</th>
                <th>رزرو</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {shifts
                .slice(currentPage * 40, (currentPage + 1) * 40)
                .map((s) => (
                  <tr key={shiftKey(s)}>
                    <td>
                      {listName(data, s)}
                      <small className="block muted">
                        {data.scheduleLists?.find(
                          (list) => list.id === s.listId,
                        )?.mode === "alternative"
                          ? "پیشنهادی"
                          : "اجرایی"}
                      </small>
                    </td>
                    <td>
                      {solarLabel(s.date)}
                      <small className="block muted">{shiftTimeLabel(s)}</small>
                    </td>
                    <td>{s.leaders?.map(name).join("، ") || "—"}</td>
                    <td>
                      {s.primary
                        .filter((id) => !s.leaders?.includes(id))
                        .map(name)
                        .join("، ") || "—"}
                    </td>
                    <td>{s.reserve.map(name).join("، ") || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() => onDay(s.date, s.listId)}
                        >
                          جزئیات روز
                        </button>
                        <button
                          className="text-button"
                          onClick={() => onEdit(shiftKey(s))}
                        >
                          ویرایش نفرات
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="برنامه‌ای در این بازه نیست"
          text="برنامه‌های ذخیره‌شده با تاریخ و نام افراد قابل جست‌وجو هستند."
        />
      )}
      {pages > 1 && (
        <div className="pagination">
          <button
            className="icon-button"
            aria-label="صفحهٔ قبلی تاریخچه"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronRight />
          </button>
          <span>
            {fa(currentPage + 1)} از {fa(pages)}
          </span>
          <button
            className="icon-button"
            aria-label="صفحهٔ بعدی تاریخچه"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronLeft />
          </button>
        </div>
      )}
      {!!data.shiftChanges?.length && (
        <section className="shift-audit">
          <h3>تاریخچهٔ ویرایش نفرات</h3>
          {data.shiftChanges.slice(0, 30).map((c) => (
            <article className="reserve-history-record" key={c.id}>
              <strong>
                {solarLabel(c.date)} · {shiftTimeLabel(c.next)}
              </strong>
              <p>
                قبل:{" "}
                {c.previous.primary
                  .map((id) => `${primaryRole(c.previous, id)}: ${name(id)}`)
                  .join("، ")}
                ؛ رزرو: {c.previous.reserve.map(name).join("، ") || "—"}
              </p>
              <p>
                بعد:{" "}
                {c.next.primary
                  .map((id) => `${primaryRole(c.next, id)}: ${name(id)}`)
                  .join("، ")}
                ؛ رزرو: {c.next.reserve.map(name).join("، ") || "—"}
              </p>
              <p>
                {c.note || "بدون توضیح"}
                {c.restOverride ? " · تداخل با تأیید کاربر" : ""}
              </p>
              <time>
                {new Intl.DateTimeFormat("fa-IR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Tehran",
                }).format(new Date(c.createdAt))}
              </time>
            </article>
          ))}
          {data.shiftChanges.length > 30 && (
            <p className="muted">
              ۳۰ ویرایش آخر نمایش داده شده؛ همهٔ تغییرات در پشتیبان و خروجی اکسل
              حفظ می‌شوند.
            </p>
          )}
        </section>
      )}
    </section>
  );
}

export function ReserveQueuePanel({
  data,
  listId = "",
}: {
  data: AppData;
  listId?: string;
}) {
  const groups = listId
    ? [listId === "legacy" ? undefined : listId]
    : data.scheduleLists?.length
      ? [
          ...(data.shifts.some((s) => !s.listId) ? [undefined] : []),
          ...data.scheduleLists.map((list) => list.id),
        ]
      : [undefined];
  return (
    <section className="panel reserve-queue-panel">
      <div className="section-toolbar">
        <div>
          <h2>نوبت افراد رزرو</h2>
          <p>
            پس از تأیید خدمت جایگزین در «ثبت وضعیت»، فرد به انتهای صف می‌رود.
            صرفِ انتخاب یا ویرایش آماده‌باش، خدمت واقعی محسوب نمی‌شود.
          </p>
        </div>
        <Badge>{fa(groups.length)} فهرست</Badge>
      </div>
      {groups.map((group) => (
        <div key={group || "legacy"}>
          <h3 className="queue-list-name">
            {data.scheduleLists?.find((list) => list.id === group)?.name ||
              "فهرست قبلی"}
          </h3>
          <ol className="reserve-queue">
            {reserveQueue(data, group).map((id) => (
              <li key={id}>
                {data.people.find((p) => p.id === id)?.name || id}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

export function ReminderPanel({
  data,
  onSave,
  notify,
}: {
  data: AppData;
  onSave: (next: AppData) => boolean;
  notify: (text: string) => void;
}) {
  const [value, setValue] = useState(
    data.reminder || { enabled: false, time: "18:00", runAtLogin: false },
  );
  useEffect(() => {
    setValue(
      data.reminder || { enabled: false, time: "18:00", runAtLogin: false },
    );
  }, [data.reminder]);
  const desktop = window.desktop;
  return (
    <section className="panel settings-panel">
      <div className="settings-title">
        <CalendarRange size={21} />
        <div>
          <h2>یادآور شیفت ویندوز</h2>
          <p>
            نمایش نام مسئول شب، همراه و رزرو فهرست‌های اجرایی امروز، به وقت
            تهران
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onSave({ ...data, reminder: value }))
            notify("تنظیمات یادآور ذخیره شد.");
        }}
      >
        <div className="form-stack">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) =>
                setValue({ ...value, enabled: e.target.checked })
              }
            />
            یادآور روزانه فعال باشد
          </label>
          <Field label="ساعت اعلان به وقت تهران">
            <input
              required
              type="time"
              value={value.time}
              onChange={(e) => setValue({ ...value, time: e.target.value })}
            />
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.runAtLogin}
              onChange={(e) =>
                setValue({ ...value, runAtLogin: e.target.checked })
              }
            />
            اجرای خودکار هم‌شیفت هنگام ورود به ویندوز
          </label>
          <Notice>
            {desktop?.platform === "win32"
              ? "با فعال بودن یادآور، بستن پنجره برنامه را در کنار ساعت ویندوز نگه می‌دارد. برای توقف کامل از منوی آیکون برنامه، «خروج» را انتخاب کنید. رایانه باید روشن و اعلان‌های ویندوز مجاز باشند."
              : "اعلان سیستمی در نسخهٔ نصب‌شدهٔ ویندوز فعال است. در این نسخه می‌توانید تنظیماتش را ذخیره کنید. برای دریافت اعلان، برنامه باید در ویندوز در حال اجرا باشد."}
          </Notice>
          <div className="row-actions">
            <button type="submit" className="button button-primary">
              <Check size={16} />
              ذخیرهٔ یادآور
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={!desktop?.testReminder}
              onClick={async () => {
                try {
                  const result = await desktop!.testReminder();
                  notify(
                    result.ok
                      ? "اعلان آزمایشی ارسال شد."
                      : result.error || "اعلان در این سیستم پشتیبانی نمی‌شود.",
                  );
                } catch {
                  notify("نمایش اعلان انجام نشد.");
                }
              }}
            >
              ارسال اعلان آزمایشی
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

import { useMemo, useState } from "react";
import { BarChart3, Download } from "lucide-react";
import type { AppData } from "./types";
import { Field, Notice, Select } from "./components";
import { DatePicker } from "./DatePicker";
import { fa, solarLabel, weekdays, dayOfWeek } from "./lib/calendar";
import { reportRows, reportStatuses, type ReportFilters } from "./lib/reports";
import { scheduleLists } from "./lib/schedules";
import { exportReport } from "./lib/excel";

export function ReportsPanel({
  data,
  start,
  end,
  notify,
}: {
  data: AppData;
  start: string;
  end: string;
  notify: (message: string) => void;
}) {
  const [filters, setFilters] = useState<ReportFilters>({
    start,
    end,
    department: "",
    personId: "",
    scheduleId: "",
    location: "",
    status: "",
    dayType: "",
    includeArchive: true,
  });
  const [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const lists = [
    ...scheduleLists(data),
    ...(data.archives || []).map((a) => a.schedule),
  ];
  const people = [
    ...new Map(
      [
        ...data.people,
        ...(data.archives || []).flatMap((a) => a.snapshot.people),
      ].map((p) => [p.id, p]),
    ).values(),
  ];
  const departments = [
    ...new Set(people.map((p) => p.department).filter(Boolean)),
  ].sort();
  const locations = [
    ...new Set(lists.map((s) => s.location).filter((l): l is string => !!l)),
  ];
  const rows = useMemo(() => reportRows(data, filters), [data, filters]);
  const update = <K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K],
  ) => {
    setFilters({ ...filters, [key]: value });
    setPage(0);
  };
  const invalid = filters.end < filters.start;
  return (
    <section
      className="panel filtered-reports"
      aria-label="گزارش‌گیری فیلترشده"
    >
      <div className="section-toolbar">
        <div>
          <h2>
            <BarChart3 size={20} /> گزارش‌گیری
          </h2>
          <p>
            کارکرد، غیبت و افراد بدون شیفت را بر اساس واحد و بازهٔ دلخواه بررسی
            کنید.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={busy || invalid || !rows.length}
          onClick={async () => {
            setBusy(true);
            try {
              await exportReport(data, filters);
              notify("گزارش اکسل با همین فیلترها آماده شد.");
            } catch {
              notify("ساخت گزارش انجام نشد؛ دوباره تلاش کنید.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          خروجی اکسل گزارش
        </button>
      </div>
      <div className="report-filters">
        <DatePicker
          label="از تاریخ گزارش"
          value={filters.start}
          onChange={(v) => update("start", v)}
        />
        <DatePicker
          label="تا تاریخ گزارش"
          value={filters.end}
          onChange={(v) => update("end", v)}
        />
        <Field label="واحد گزارش">
          <Select
            value={filters.department}
            onChange={(e) => update("department", e.target.value)}
          >
            <option value="">همهٔ واحدها</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="پرسنل گزارش">
          <Select
            value={filters.personId}
            onChange={(e) => update("personId", e.target.value)}
          >
            <option value="">همهٔ پرسنل</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.id}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="فهرست برنامهٔ گزارش">
          <Select
            value={filters.scheduleId}
            onChange={(e) => update("scheduleId", e.target.value)}
          >
            <option value="">همهٔ فهرست‌ها</option>
            {lists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="محل خدمت گزارش">
          <Select
            value={filters.location}
            onChange={(e) => update("location", e.target.value)}
          >
            <option value="">همهٔ موقعیت‌ها</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="وضعیت شیفت در گزارش">
          <Select
            value={filters.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">همهٔ افراد دارای نقش</option>
            {Object.entries(reportStatuses).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نوع روز گزارش">
          <Select
            value={filters.dayType}
            onChange={(e) => update("dayType", e.target.value)}
          >
            <option value="">همهٔ روزها</option>
            <option value="normal">عادی</option>
            <option value="holiday">تعطیل</option>
            <option value="friday">جمعه</option>
          </Select>
        </Field>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={filters.includeArchive}
          onChange={(e) => update("includeArchive", e.target.checked)}
        />
        حق شیفت‌های محفوظ در بایگانی هم در گزارش باشد
      </label>
      <Notice>
        «حضور ثبت نشده» با غیبت تفاوت دارد. «بدون شیفت» یعنی فرد عضو فهرست بوده
        ولی در آن روز نقش اصلی، رزرو یا جایگزین نداشته است؛ روزهای بدون برنامه،
        غیبت محسوب نمی‌شوند.
      </Notice>
      {invalid ? (
        <p role="alert" className="danger">
          پایان بازه نباید قبل از شروع باشد.
        </p>
      ) : (
        <>
          <div className="report-summary">
            <span>
              <b>{fa(rows.length)}</b> نفر ـ روز
            </span>
            <span>
              <b>{fa(new Set(rows.map((r) => r.personId)).size)}</b> نفر
            </span>
            <span>
              <b>
                {fa(
                  rows.filter((r) =>
                    ["present", "replacement"].includes(r.status),
                  ).length,
                )}
              </b>{" "}
              حضور ثبت‌شده
            </span>
            <span>
              <b>
                {fa(
                  rows.filter((r) =>
                    ["excused", "unexcused"].includes(r.status),
                  ).length,
                )}
              </b>{" "}
              غیبت
            </span>
          </div>
          {rows.length ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>تاریخ</th>
                      <th>روز هفته</th>
                      <th>نام</th>
                      <th>واحد</th>
                      <th>فهرست / محل</th>
                      <th>نقش</th>
                      <th>وضعیت</th>
                      <th>توضیح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(page * 50, (page + 1) * 50).map((r, i) => (
                      <tr
                        key={`${r.date}-${r.personId}-${i}`}
                        className={r.holiday ? "report-holiday" : ""}
                      >
                        <td>{solarLabel(r.date)}</td>
                        <td>{weekdays[dayOfWeek(r.date)]}</td>
                        <td>{r.name}</td>
                        <td>{r.department || "—"}</td>
                        <td>
                          {r.schedule}
                          <small className="report-location">
                            {r.location}
                            {r.archived ? " · بایگانی حق شیفت" : ""}
                          </small>
                        </td>
                        <td>{r.role}</td>
                        <td>{reportStatuses[r.status]}</td>
                        <td>{r.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="report-pagination">
                <button
                  className="button button-secondary"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  صفحهٔ قبل
                </button>
                <span>
                  {fa(page + 1)} از {fa(Math.ceil(rows.length / 50))}
                </span>
                <button
                  className="button button-secondary"
                  disabled={(page + 1) * 50 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  صفحهٔ بعد
                </button>
              </div>
            </>
          ) : (
            <p className="aside-empty">ردیفی با این فیلترها پیدا نشد.</p>
          )}
        </>
      )}
    </section>
  );
}

import { useState } from "react";
import { Archive, Trash2, CalendarRange, MapPin } from "lucide-react";
import type { AppData, ScheduleList, ShiftArchive } from "./types";
import { Field, Modal, Notice, Select } from "./components";
import { archiveSchedule, listShifts, scheduleLists } from "./lib/schedules";
import { fa, solarLabel, todayKey, dateKey, parseDate } from "./lib/calendar";
import { personStats, workingIds } from "./lib/scheduler";

export function ScheduleManager({
  data,
  onSave,
  onSelect,
  selected,
  onBackup,
}: {
  data: AppData;
  onSave: (data: AppData, message: string) => boolean;
  onSelect: (list: ScheduleList | null) => void;
  selected: string;
  onBackup: () => void;
}) {
  const lists = scheduleLists(data);
  const [removing, setRemoving] = useState<ScheduleList | null>(null);
  const [audit, setAudit] = useState<ShiftArchive | null>(null);
  const [form, setForm] = useState({
    reason: "",
    recordedBy: "",
    rights: "" as "" | "preserve" | "mistake",
    restAcknowledged: false,
    confirmation: "",
  });
  const [error, setError] = useState("");
  const shifts = removing ? listShifts(data, removing) : [];
  const hasHistory =
    shifts.some((s) => s.attendance.length) ||
    data.swaps.some((s) =>
      shifts.some((d) => d.date === s.firstDate || d.date === s.secondDate),
    ) ||
    data.reserveChanges?.some((c) => shifts.some((d) => d.date === c.date));
  return (
    <section className="panel list-manager">
      <div className="section-toolbar">
        <div>
          <h2>
            <CalendarRange size={20} /> فهرست برنامه‌ها
          </h2>
          <p>
            هر فهرست، بازه و اعضای مشخص دارد. حذف با ثبت وضعیت حق شیفت انجام
            می‌شود.
          </p>
        </div>
        <Select
          aria-label="نمایش فهرست برنامه"
          value={selected}
          onChange={(e) =>
            onSelect(lists.find((s) => s.id === e.target.value) || null)
          }
        >
          <option value="">همهٔ برنامه‌ها</option>
          {lists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="roster-cards">
        {lists.length ? (
          lists.map((s) => (
            <article key={s.id} className="roster-card">
              <strong>{s.name}</strong>
              <span>
                {solarLabel(s.startDate)} تا {solarLabel(s.endDate)}
              </span>
              <small>
                {fa(s.personIds.length)} نفر
                {s.location ? ` · ${s.location}` : ""}
              </small>
              <div className="row-actions">
                <button className="text-button" onClick={() => onSelect(s)}>
                  نمایش برنامه
                </button>
                <button
                  className="text-button danger"
                  aria-label={`حذف برنامه ${s.name}`}
                  onClick={() => {
                    setForm({
                      reason: "",
                      recordedBy: "",
                      rights: "",
                      restAcknowledged: false,
                      confirmation: "",
                    });
                    setError("");
                    setRemoving(s);
                  }}
                >
                  <Trash2 size={15} /> حذف برنامه
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="aside-empty">
            هنوز برنامه‌ای ندارید. از «ایجاد برنامهٔ عادلانه» شروع کنید.
          </p>
        )}
      </div>
      {!!data.archives?.length && (
        <details className="rights-archive">
          <summary>
            <Archive size={17} /> دفتر ثبت حق شیفت و حذف‌ها (
            {fa(data.archives.length)})
          </summary>
          {data.archives.map((a) => (
            <div className="archive-row" key={a.id}>
              <div>
                <strong>{a.schedule.name}</strong>
                <p>
                  {a.rights === "preserve"
                    ? `حفظ حق شیفت: ${fa(a.creditedDates.length)} روز`
                    : "لغو برنامهٔ اشتباه، بدون احتساب کارکرد"}{" "}
                  · ثبت‌کننده: {a.recordedBy}
                </p>
              </div>
              <button className="text-button" onClick={() => setAudit(a)}>
                مشاهدهٔ سند و حق افراد
              </button>
            </div>
          ))}
        </details>
      )}
      {removing && (
        <Modal
          title="حذف امن برنامه و ثبت حق شیفت"
          subtitle={removing.name}
          onClose={() => setRemoving(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.rights || form.confirmation !== removing.name) return;
              try {
                const next = archiveSchedule(data, removing.id, {
                  ...form,
                  rights: form.rights,
                });
                if (onSave(next, "برنامه از فهرست فعال حذف و سند آن ثبت شد.")) {
                  if (selected === removing.id) onSelect(null);
                  setRemoving(null);
                } else setError("ذخیرهٔ سند انجام نشد؛ برنامه حذف نشده است.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="modal-body form-stack">
              <Notice warning>
                این کار {fa(shifts.length)} روز برنامه را از فهرست فعال خارج
                می‌کند. سند برنامه، اسامی، حضور و غیاب و دلیل حذف در دفتر حق
                شیفت باقی می‌ماند. برای بازگرداندن کامل، پشتیبان بگیرید.
              </Notice>
              <button
                type="button"
                className="button button-secondary"
                onClick={onBackup}
              >
                دریافت پشتیبان پیش از حذف
              </button>
              <Field label="وضعیت حق شیفت افراد">
                <Select
                  required
                  value={form.rights}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      rights: e.target.value as typeof form.rights,
                    })
                  }
                >
                  <option value="">وضعیت را مشخص کنید</option>
                  <option value="preserve">
                    ثبت و حفظ حق شیفت‌های انجام‌شده تا امروز
                  </option>
                  <option value="mistake" disabled={!!hasHistory}>
                    برنامه اشتباه است و هیچ شیفتی اجرا یا ثبت نشده
                  </option>
                </Select>
              </Field>
              <Notice>
                در حالت حفظ حق شیفت، روزهای تا امروز در سابقهٔ عدالت و کنترل
                استراحت باقی می‌مانند؛ روزهای آینده لغو می‌شوند. حضورِ ثبت‌نشده
                به معنی تأیید حضور نیست؛ پیش از حذف، وضعیت واقعی را در حضور و
                غیاب تکمیل کنید.
              </Notice>
              {hasHistory && (
                <Notice warning>
                  این فهرست سابقهٔ حضور، جابه‌جایی یا تغییر رزرو دارد و نمی‌توان
                  آن را بدون سابقه اعلام کرد.
                </Notice>
              )}
              <RightsTable
                data={data}
                shifts={
                  form.rights === "preserve"
                    ? shifts.filter((s) => s.date <= todayKey())
                    : []
                }
                personIds={[
                  ...new Set(
                    shifts.flatMap((s) => [...s.primary, ...s.reserve]),
                  ),
                ]}
              />
              <div className="form-grid">
                <Field label="نام مسئول ثبت">
                  <input
                    required
                    maxLength={100}
                    value={form.recordedBy}
                    onChange={(e) =>
                      setForm({ ...form, recordedBy: e.target.value })
                    }
                  />
                </Field>
                <Field label="دلیل حذف برنامه">
                  <input
                    required
                    maxLength={500}
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value })
                    }
                  />
                </Field>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.restAcknowledged}
                  onChange={(e) =>
                    setForm({ ...form, restAcknowledged: e.target.checked })
                  }
                />
                حق شیفت و حق استراحت افراد را بررسی کردم و مسئولیت این ثبت را
                می‌پذیرم.
              </label>
              <Field
                label={`برای تأیید، نام برنامه را بنویسید: ${removing.name}`}
              >
                <input
                  autoComplete="off"
                  value={form.confirmation}
                  onChange={(e) =>
                    setForm({ ...form, confirmation: e.target.value })
                  }
                />
              </Field>
              {error && (
                <p role="alert" className="danger">
                  {error}
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="button button-danger"
                disabled={
                  !form.rights ||
                  !form.restAcknowledged ||
                  !form.reason.trim() ||
                  !form.recordedBy.trim() ||
                  form.confirmation !== removing.name
                }
              >
                ثبت سند و حذف برنامه
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRemoving(null)}
              >
                انصراف
              </button>
            </div>
          </form>
        </Modal>
      )}
      {audit && (
        <Modal
          title="سند ثبت حق شیفت"
          subtitle={audit.schedule.name}
          onClose={() => setAudit(null)}
          wide
        >
          <div className="modal-body form-stack">
            <Notice>
              ثبت در{" "}
              {new Date(audit.createdAt).toLocaleString("fa-IR", {
                timeZone: "Asia/Tehran",
              })}{" "}
              توسط {audit.recordedBy}؛ دلیل: {audit.reason}
            </Notice>
            <p>
              {audit.rights === "preserve"
                ? "حق روزهای زیر در محاسبات سابقه و استراحت محفوظ است."
                : "برنامهٔ اشتباه و بدون کارکرد؛ سهمی به سابقه افزوده نشده است."}
            </p>
            <RightsTable
              data={{ ...data, ...audit.snapshot }}
              shifts={audit.snapshot.shifts.filter((s) =>
                audit.creditedDates.includes(s.date),
              )}
              personIds={[
                ...new Set(
                  audit.snapshot.shifts.flatMap((s) => [
                    ...s.primary,
                    ...s.reserve,
                  ]),
                ),
              ]}
            />
          </div>
          <div className="modal-footer">
            <button
              className="button button-secondary"
              onClick={() => setAudit(null)}
            >
              بستن
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function RightsTable({
  data,
  shifts,
  personIds,
}: {
  data: AppData;
  shifts: AppData["shifts"];
  personIds: string[];
}) {
  return (
    <div className="table-scroll rights-table">
      <table>
        <thead>
          <tr>
            <th>نام فرد</th>
            <th>شیفت برنامه‌ریزی‌شده</th>
            <th>حاضر</th>
            <th>جایگزین</th>
            <th>آماده‌باش رزرو</th>
            <th>غایب</th>
            <th>حضور ثبت‌نشده</th>
            <th>سهم کارکرد با کسر غیبت</th>
            <th>آخرین روز کارکرد</th>
            <th>نخستین روز مجاز بعدی با رعایت استراحت</th>
          </tr>
        </thead>
        <tbody>
          {data.people
            .filter((p) => personIds.includes(p.id))
            .map((p) => {
              const s = personStats(p.id, shifts, data);
              const last = shifts
                .filter((shift) => workingIds(shift).includes(p.id))
                .map((shift) => shift.date)
                .sort()
                .at(-1);
              const nextAllowed = last
                ? dateKey(
                    new Date(
                      parseDate(last).getTime() +
                        (data.settings.minRestDays + 1) * 86400000,
                    ),
                  )
                : null;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{fa(s.total)}</td>
                  <td>{fa(s.present)}</td>
                  <td>{fa(s.replacements)}</td>
                  <td>{fa(s.reserve)}</td>
                  <td>{fa(s.excused + s.unexcused)}</td>
                  <td>{fa(s.total - s.present - s.excused - s.unexcused)}</td>
                  <td>{fa(s.workload)}</td>
                  <td>{last ? solarLabel(last) : "—"}</td>
                  <td>{nextAllowed ? solarLabel(nextAllowed) : "—"}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export function LocationsPanel({
  data,
  onSave,
}: {
  data: AppData;
  onSave: (data: AppData, message: string) => boolean;
}) {
  const [value, setValue] = useState(""),
    [removing, setRemoving] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="panel settings-panel">
      <div className="settings-title">
        <MapPin size={21} />
        <div>
          <h2>فهرست موقعیت‌ها و محل خدمت</h2>
          <p>محل خدمت را هنگام ایجاد برنامه انتخاب کنید.</p>
        </div>
      </div>
      <form
        className="location-add"
        onSubmit={(e) => {
          e.preventDefault();
          const name = value.trim();
          if (!name || data.locations?.includes(name)) {
            setError("نام محل خدمت خالی یا تکراری است.");
            return;
          }
          if (
            onSave(
              { ...data, locations: [...(data.locations || []), name] },
              "محل خدمت اضافه شد.",
            )
          ) {
            setValue("");
            setError("");
          }
        }}
      >
        <Field label="نام محل خدمت">
          <input
            required
            maxLength={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <button className="button button-primary">افزودن موقعیت</button>
      </form>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      {(data.locations || []).map((location) => (
        <div className="archive-row" key={location}>
          <b>{location}</b>
          <button
            className="text-button danger"
            aria-label={`حذف موقعیت ${location}`}
            onClick={() => {
              setRemoving(location);
              setConfirmation("");
            }}
          >
            حذف موقعیت
          </button>
        </div>
      ))}
      {!(data.locations || []).length && (
        <p className="aside-empty">هنوز محل خدمتی اضافه نشده است.</p>
      )}
      {removing && (
        <Modal
          title="حذف موقعیت از فهرست انتخاب"
          onClose={() => setRemoving("")}
        >
          <div className="modal-body form-stack">
            <Notice warning>
              «{removing}» از گزینه‌های برنامه‌های جدید حذف می‌شود. نام محل خدمت
              در برنامه‌ها و سوابق قبلی باقی می‌ماند؛ هیچ شیفت یا حق استراحتی
              حذف نمی‌شود.
            </Notice>
            <Field label={`برای تأیید، نام موقعیت را بنویسید: ${removing}`}>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
          </div>
          <div className="modal-footer">
            <button
              className="button button-danger"
              disabled={confirmation !== removing}
              onClick={() => {
                if (
                  onSave(
                    {
                      ...data,
                      locations: (data.locations || []).filter(
                        (l) => l !== removing,
                      ),
                    },
                    "موقعیت از فهرست انتخاب حذف شد؛ سوابق قبلی محفوظ‌اند.",
                  )
                )
                  setRemoving("");
              }}
            >
              تأیید حذف موقعیت
            </button>
            <button
              className="button button-secondary"
              onClick={() => setRemoving("")}
            >
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

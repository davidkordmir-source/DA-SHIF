import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { AppData, PersonnelCategory } from "./types";
import { DatePicker } from "./DatePicker";
import { Field, Modal, Notice, Select } from "./components";
import { fa, solarLabel } from "./lib/calendar";
import { personnelCategories, personnelRoster } from "./lib/people";
import { dateRange, historyShifts } from "./lib/schedules";

export type GenerationForm = {
  name: string;
  start: string;
  end: string;
  location: string;
  nightLeadIds: string[];
  companionIds: string[];
  hasCompanions: boolean | null;
  reserveIds: string[];
  reserveCount: number;
};

export function ScheduleWizard({
  data,
  value,
  onChange,
  step,
  onStep,
  onImport,
  onSubmit,
  onClose,
  error,
  onError,
}: {
  data: AppData;
  value: GenerationForm;
  onChange: (value: GenerationForm) => void;
  step: number;
  onStep: (step: number) => void;
  onImport: (category: PersonnelCategory) => void;
  onSubmit: () => void;
  onClose: () => void;
  error: string;
  onError: (error: string) => void;
}) {
  const category: PersonnelCategory =
    step === 0 ? "night-lead" : step === 1 ? "companion" : "reserve";
  const field =
    step === 0 ? "nightLeadIds" : step === 1 ? "companionIds" : "reserveIds";
  const roster = personnelRoster(data.people, category).filter((p) => p.active);
  const leads = personnelRoster(data.people, "night-lead").filter(
    (p) => p.active && value.nightLeadIds.includes(p.id),
  );
  const companions = personnelRoster(data.people, "companion").filter(
    (p) => p.active && value.companionIds.includes(p.id),
  );
  let dates: string[] = [];
  try {
    dates = dateRange(value.start, value.end);
  } catch {
    /* Explain invalid dates on Continue. */
  }
  const next = () => {
    try {
      if (step === 0) {
        if (!value.name.trim() || value.name.trim().length > 100)
          throw new Error("نام فهرست برنامه را وارد کنید (حداکثر ۱۰۰ حرف).");
        const range = dateRange(value.start, value.end);
        if (!leads.length)
          throw new Error(
            "ابتدا فهرست مسئول شب را وارد و حداقل یک نفر را انتخاب کنید. افراد همراه جای مسئول شب انتخاب نمی‌شوند.",
          );
        if (historyShifts(data).some((s) => range.includes(s.date)))
          throw new Error(
            "این بازه برنامه یا حق شیفت محفوظ دارد؛ برنامهٔ موجود خودکار بازنویسی نمی‌شود.",
          );
      }
      if (step === 1) {
        if (value.hasCompanions === null)
          throw new Error("مشخص کنید فهرست همراه دارید یا خیر.");
        if (value.hasCompanions && !companions.length)
          throw new Error(
            "فهرست همراه را وارد و حداقل یک نفر انتخاب کنید؛ یا گزینهٔ بدون همراه را بزنید.",
          );
      }
      onError("");
      onStep(step + 1);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <Modal
      title="ایجاد برنامهٔ عادلانه"
      subtitle={`${solarLabel(value.start)} تا ${solarLabel(value.end)} · به ترتیب فهرست اکسل`}
      onClose={onClose}
    >
      <div className="modal-body form-stack">
        <ol className="roster-steps" aria-label="مراحل ساخت برنامه">
          {["مسئول شب و بازه", "همراه اختیاری", "رزرو و تأیید"].map(
            (label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={
                  step === index ? "current" : step > index ? "complete" : ""
                }
              >
                <span>
                  {step > index ? <Check size={14} /> : fa(index + 1)}
                </span>
                {label}
              </li>
            ),
          )}
        </ol>
        {step === 0 && (
          <>
            <div className="generation-visual">
              <h3>اول، برنامهٔ مسئول شب</h3>
              <p>
                هر روز یک مسئول شب؛ از اولین نفر اکسل تا آخرین نفر و سپس دوباره
                از ابتدا.
              </p>
            </div>
            <Field label="نام فهرست برنامه">
              <input
                maxLength={100}
                value={value.name}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <DatePicker
                label="تاریخ شروع برنامه"
                value={value.start}
                onChange={(start) => onChange({ ...value, start })}
              />
              <DatePicker
                label="تاریخ پایان برنامه"
                value={value.end}
                onChange={(end) => onChange({ ...value, end })}
              />
              <Field label="محل خدمت برنامه">
                <Select
                  value={value.location}
                  onChange={(e) =>
                    onChange({ ...value, location: e.target.value })
                  }
                >
                  <option value="">بدون موقعیت مشخص</option>
                  {(data.locations || []).map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h3>آیا فهرست همراه هم دارید؟</h3>
            <div
              className="companion-choice"
              role="group"
              aria-label="انتخاب همراه"
            >
              <label className={value.hasCompanions === false ? "chosen" : ""}>
                <input
                  type="radio"
                  name="has-companions"
                  checked={value.hasCompanions === false}
                  onChange={() => onChange({ ...value, hasCompanions: false })}
                />
                <span>
                  <b>خیر، شیفت یک‌نفره</b>
                  <small>
                    هر روز فقط مسئول شب؛ کسی از فهرست او همراه نمی‌شود.
                  </small>
                </span>
              </label>
              <label className={value.hasCompanions === true ? "chosen" : ""}>
                <input
                  type="radio"
                  name="has-companions"
                  checked={value.hasCompanions === true}
                  onChange={() => onChange({ ...value, hasCompanions: true })}
                />
                <span>
                  <b>بله، فهرست همراه دارم</b>
                  <small>یک همراه از فهرست جدا، به ترتیب اکسل.</small>
                </span>
              </label>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3>رزرو، جدا از مسئول شب و همراه</h3>
            <Field
              label="تعداد رزرو این برنامه در روز"
              hint="برای برنامهٔ بدون رزرو عدد صفر وارد کنید."
            >
              <input
                type="number"
                min={0}
                max={20}
                value={value.reserveCount}
                onChange={(e) =>
                  onChange({ ...value, reserveCount: Number(e.target.value) })
                }
              />
            </Field>
          </>
        )}
        {(step !== 1 || value.hasCompanions) && (
          <section
            className="generation-team"
            aria-label={`فهرست ${personnelCategories[category]}`}
          >
            <div className="section-toolbar">
              <div>
                <h3>فهرست {personnelCategories[category]}</h3>
                <p>
                  {fa(
                    value[field].filter((id) => roster.some((p) => p.id === id))
                      .length,
                  )}{" "}
                  نفر انتخاب شده · ترتیب ردیف اکسل
                </p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => onImport(category)}
              >
                <Upload size={16} />
                ورود پرسنل از اکسل
              </button>
            </div>
            <div className="row-actions">
              <button
                className="text-button"
                onClick={() =>
                  onChange({ ...value, [field]: roster.map((p) => p.id) })
                }
              >
                انتخاب همه
              </button>
              <button
                className="text-button"
                onClick={() => onChange({ ...value, [field]: [] })}
              >
                لغو انتخاب همه
              </button>
            </div>
            <div className="generation-people">
              {roster.map((p, index) => (
                <label className="checkbox-label" key={p.id}>
                  <input
                    type="checkbox"
                    checked={value[field].includes(p.id)}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [field]: e.target.checked
                          ? [...value[field], p.id]
                          : value[field].filter((id) => id !== p.id),
                      })
                    }
                  />
                  <span>
                    <small>
                      نفر {fa(index + 1)} · {p.department}
                    </small>
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
            {!roster.length && (
              <p className="roster-empty">
                فهرست {personnelCategories[category]} خالی است. فایل یا شیت این
                دسته را وارد کنید. دستهٔ افراد قبلی را هم می‌توانید در بخش پرسنل
                اصلاح کنید.
              </p>
            )}
          </section>
        )}
        {step > 0 && leads.length > 0 && (
          <section
            aria-label="پیش‌نمایش ترتیب شیفت‌ها"
            className="roster-preview"
          >
            <h3>
              {step === 1
                ? "نوبت مسئول شب در بازهٔ انتخابی"
                : "پیش‌نمایش برنامه"}
            </h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>تاریخ</th>
                    <th>مسئول شب</th>
                    {step === 2 && <th>همراه</th>}
                  </tr>
                </thead>
                <tbody>
                  {dates.slice(0, 7).map((date, index) => (
                    <tr key={date}>
                      <td>{solarLabel(date)}</td>
                      <td>{leads[index % leads.length].name}</td>
                      {step === 2 && (
                        <td>
                          {value.hasCompanions && companions.length
                            ? companions[index % companions.length].name
                            : "بدون همراه — شیفت یک‌نفره"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dates.length > 7 && (
              <small className="muted">
                نمایش ۷ روز اول از {fa(dates.length)} روز؛ ترتیب در ادامهٔ بازه
                و عبور از ماه حفظ می‌شود.
              </small>
            )}
          </section>
        )}
        {step === 2 && (
          <div className="generation-facts">
            <div>
              <span>مسئول شب روزانه</span>
              <b>۱ نفر</b>
            </div>
            <div>
              <span>همراه روزانه</span>
              <b>{value.hasCompanions ? "۱ نفر" : "بدون همراه"}</b>
            </div>
            <div>
              <span>رزرو روزانه</span>
              <b>{fa(value.reserveCount)} نفر</b>
            </div>
          </div>
        )}
        <Notice>
          ترتیب اکسل در هر دسته مستقل است. استراحت و سوابق بررسی می‌شوند؛ در
          صورت تداخل، هشدار ثبت می‌شود و ترتیب افراد خودکار عوض نمی‌شود.
          برنامه‌های قبلی بازنویسی نمی‌شوند.
        </Notice>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button
          className="button button-primary"
          onClick={step === 2 ? onSubmit : next}
        >
          {step === 2 ? <WandSparkles size={17} /> : <ArrowLeft size={17} />}
          {step === 0
            ? "ادامه: انتخاب همراه"
            : step === 1
              ? "ادامه: رزرو و تأیید"
              : "ساخت برنامهٔ انتخاب‌شده"}
        </button>
        {step > 0 && (
          <button
            className="button button-secondary"
            onClick={() => {
              onError("");
              onStep(step - 1);
            }}
          >
            <ArrowRight size={16} />
            مرحلهٔ قبل
          </button>
        )}
        <button className="button button-secondary" onClick={onClose}>
          انصراف
        </button>
      </div>
    </Modal>
  );
}

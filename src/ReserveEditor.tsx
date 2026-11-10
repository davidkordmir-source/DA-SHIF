import { useState } from "react";
import { ArrowLeft, Check, Search, ShieldCheck } from "lucide-react";
import type { AppData, ReserveChange } from "./types";
import { Badge, Empty, Field, Modal, Notice, Select } from "./components";
import { fa, latin, solarLabel } from "./lib/calendar";
import { reserveDutyConflicts, updateReserves } from "./lib/scheduler";

export function ReserveEditor({
  data,
  initialDate,
  onSave,
  onClose,
}: {
  data: AppData;
  initialDate: string;
  onSave: (next: AppData) => boolean;
  onClose: () => void;
}) {
  const first =
    data.shifts.find((s) => s.date === initialDate) || data.shifts[0];
  const [date, setDate] = useState(first?.date || "");
  const [ids, setIds] = useState<string[]>(first ? [...first.reserve] : []);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const shift = data.shifts.find((s) => s.date === date);
  const locked = new Set(
    shift?.attendance.flatMap((a) =>
      a.replacementId ? [a.replacementId] : [],
    ) || [],
  );
  const normalized = (value: string) =>
    latin(value).replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
  const candidates = data.people
    .filter((p) => p.active || shift?.reserve.includes(p.id))
    .filter(
      (p) =>
        ids.includes(p.id) ||
        normalized(`${p.name} ${p.id} ${p.department}`).includes(
          normalized(query.trim()),
        ),
    );
  const conflicts = ids.filter(
    (id) => reserveDutyConflicts(data, date, id).length > 0,
  );
  const changed = !!shift && ids.some((id) => !shift.reserve.includes(id));
  const name = (id: string) => data.people.find((p) => p.id === id)?.name || id;
  return (
    <Modal
      title="ویرایش رزروهای روز"
      subtitle="رزروها را از تمام پرسنل فعال، به انتخاب خودتان تعیین کنید."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            const next = updateReserves(data, date, ids, note);
            if (onSave(next)) onClose();
            else setError("ذخیره‌سازی انجام نشد. پیام خطا را بررسی کنید.");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="modal-body form-stack">
          <Field label="تاریخ رزرو">
            <Select
              required
              value={date}
              onChange={(e) => {
                const s = data.shifts.find((s) => s.date === e.target.value);
                setDate(e.target.value);
                setIds(s ? [...s.reserve] : []);
                setNote("");
                setError("");
              }}
            >
              <option value="">انتخاب تاریخ</option>
              {data.shifts.map((s) => (
                <option key={s.date} value={s.date}>
                  {solarLabel(s.date)}
                </option>
              ))}
            </Select>
          </Field>
          {shift && ids.length ? (
            <>
              <Notice>
                تعداد رزرو این روز {fa(ids.length)} نفر است. می‌توانید هر جایگاه
                را به فرد دیگری بدهید؛ نیروی اصلی همان روز و فرد تکراری قابل
                انتخاب نیستند. تغییرات با نام افراد، تاریخ و توضیح در تاریخچه
                ثبت می‌شوند.
              </Notice>
              <label className="search-input reserve-search">
                <Search size={17} />
                <input
                  aria-label="جست‌وجو در پرسنل برای رزرو"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="جست‌وجوی نام، کد یا واحد…"
                />
              </label>
              <div className="reserve-editor-grid">
                {ids.map((id, index) => (
                  <div className="reserve-editor-slot" key={index}>
                    <div className="reserve-slot-heading">
                      <span>
                        <ShieldCheck size={17} />
                        رزرو {fa(index + 1)}
                      </span>
                      {locked.has(id) ? (
                        <Badge tone="blue">حضور جایگزین ثبت‌شده</Badge>
                      ) : (
                        <Badge tone="gray">قابل تغییر</Badge>
                      )}
                    </div>
                    <Field label={`انتخاب نفر رزرو ${fa(index + 1)}`}>
                      <Select
                        required
                        disabled={locked.has(id)}
                        value={id}
                        onChange={(e) => {
                          setIds(
                            ids.map((v, i) =>
                              i === index ? e.target.value : v,
                            ),
                          );
                          setError("");
                        }}
                      >
                        {candidates.map((p) => {
                          const main = shift.primary.includes(p.id),
                            other = ids.some(
                              (v, i) => i !== index && v === p.id,
                            );
                          return (
                            <option
                              key={p.id}
                              value={p.id}
                              disabled={main || other}
                            >
                              {p.name}
                              {main
                                ? " — نیروی اصلی همین روز"
                                : other
                                  ? " — رزرو دیگر"
                                  : !p.active
                                    ? " — غیرفعال؛ رزرو قبلی"
                                    : ""}
                              {p.department ? ` (${p.department})` : ""}
                            </option>
                          );
                        })}
                      </Select>
                    </Field>
                    <small className="reserve-previous">
                      رزرو قبلی: {name(shift.reserve[index])}
                    </small>
                  </div>
                ))}
              </div>
              {conflicts.length > 0 && (
                <Notice warning>
                  {conflicts.map(name).join("، ")} در فاصلهٔ نزدیک این روز شیفت
                  اصلی یا حضور جایگزین دارند. ثبت آماده‌باش مجاز است؛ اگر واقعاً
                  جای فرد غایب قرار بگیرند، حداقل فاصلهٔ استراحت دوباره بررسی
                  می‌شود.
                </Notice>
              )}
              <Field label="توضیح تغییر رزرو (اختیاری)">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثلاً با هماهنگی پرسنل"
                />
              </Field>
            </>
          ) : (
            <Empty
              title="این روز رزرو ندارد"
              text="برای روزی که در برنامه نیروی رزرو دارد، می‌توانید نفرات را تغییر دهید."
            />
          )}
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="submit"
            className="button button-primary"
            disabled={!changed}
          >
            <Check size={17} />
            ذخیرهٔ رزروهای روز
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ReserveHistory({
  changes,
  name,
}: {
  changes: ReserveChange[];
  name: (id: string) => string;
}) {
  if (!changes.length) return null;
  return (
    <section className="reserve-history">
      <div className="reserve-history-heading">
        <h3>
          <ShieldCheck size={18} />
          تاریخچهٔ تغییرات رزرو
        </h3>
        <Badge tone="gray">{fa(changes.length)} تغییر</Badge>
      </div>
      {[...changes]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((change) => (
          <article className="reserve-history-record" key={change.id}>
            <div className="reserve-history-top">
              <strong>{solarLabel(change.date)}</strong>
              <Badge tone={change.source === "attendance" ? "blue" : "green"}>
                {change.source === "attendance"
                  ? "انتخاب جایگزین دستی"
                  : "ویرایش دستی رزرو"}
              </Badge>
            </div>
            <div className="reserve-history-rosters">
              <span>
                <small>رزروهای قبلی</small>
                {change.previousIds.map(name).join("، ")}
              </span>
              <ArrowLeft size={17} />
              <span>
                <small>رزروهای جدید</small>
                {change.nextIds.map(name).join("، ")}
              </span>
            </div>
            {change.note && <p>{change.note}</p>}
            <time dateTime={change.createdAt}>
              ثبت در{" "}
              {new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Tehran",
              }).format(new Date(change.createdAt))}
            </time>
          </article>
        ))}
    </section>
  );
}

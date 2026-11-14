import { useState } from "react";
import { Check, Plus, Search, Trash2, WandSparkles } from "lucide-react";
import type { AppData, PersonRole, ScheduleList } from "./types";
import { Field, Modal, Notice } from "./components";
import {
  dayDistance,
  fa,
  latin,
  parseSolarInput,
  solarInput,
  todayKey,
} from "./lib/calendar";
import { editShift, generateRangeSchedule } from "./lib/planning";
import { listName, personRoleLabel, roleLabels } from "./lib/shift-utils";

export function PlanningDialog({
  data,
  start,
  end,
  onSave,
  onClose,
  initialListId,
}: {
  data: AppData;
  start: string;
  end: string;
  onSave: (next: AppData) => boolean;
  onClose: () => void;
  initialListId?: string;
}) {
  const [startDate, setStartDate] = useState(solarInput(start));
  const [endDate, setEndDate] = useState(solarInput(end));
  const [days, setDays] = useState(String(dayDistance(end, start) + 1));
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(
    initialListId &&
      data.scheduleLists?.some((list) => list.id === initialListId)
      ? initialListId
      : data.scheduleLists?.[0]?.id || "",
  );
  const [newListName, setNewListName] = useState(
    data.scheduleLists?.length
      ? `فهرست ${fa(data.scheduleLists.length + 1)}`
      : "فهرست اصلی",
  );
  const [listMode, setListMode] = useState<ScheduleList["mode"]>("parallel");
  const [leaderCount, setLeaderCount] = useState(
    data.settings.leaderCount ?? Math.min(1, data.settings.primaryCount),
  );
  const [companionCount, setCompanionCount] = useState(
    data.settings.primaryCount - leaderCount,
  );
  const [reserveCount, setReserveCount] = useState(data.settings.reserveCount);
  const [selected, setSelected] = useState(
    data.people.filter((p) => p.active).map((p) => p.id),
  );
  const [hourly, setHourly] = useState(false);
  const [times, setTimes] = useState([
    { startTime: "08:00", endTime: "16:00" },
  ]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const updateEnd = (startText: string, countText: string) => {
    try {
      const count = Number(latin(countText));
      if (!Number.isInteger(count) || count < 1 || count > 3660) return;
      const date = parseSolarInput(startText);
      setEndDate(
        solarInput(
          new Date(Date.parse(`${date}T00:00:00Z`) + (count - 1) * 86400000)
            .toISOString()
            .slice(0, 10),
        ),
      );
    } catch {
      /* A date can be incomplete while the user types. */
    }
  };
  return (
    <Modal
      title="ایجاد برنامهٔ عادلانه"
      subtitle="از یک روز تا چند سال؛ با تاریخ شروع و نفرات دلخواه"
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          // Let the busy state paint before calculating a long date range.
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => setTimeout(resolve, 0)),
          );
          try {
            const next = generateRangeSchedule(data, {
              title,
              ...(listId ? { listId } : { listName: newListName, listMode }),
              startDate: parseSolarInput(startDate),
              endDate: parseSolarInput(endDate),
              leaderCount,
              companionCount,
              reserveCount,
              peopleIds: selected,
              ...(hourly ? { times } : {}),
            });
            if (onSave(next)) onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-stack planning-form">
          <Field label="فهرست موقعیت">
            <select value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">ساخت فهرست جدید با نام دلخواه</option>
              {data.scheduleLists?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ·{" "}
                  {list.mode === "parallel" ? "اجرایی" : "پیشنهادی"}
                </option>
              ))}
            </select>
          </Field>
          {!listId && (
            <div className="form-grid">
              <Field label="نام فهرست جدید">
                <input
                  required
                  maxLength={100}
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="مثلاً ساختمان مرکزی، بخش دوم یا حالت ویژه"
                />
              </Field>
              <Field label="کاربرد فهرست">
                <select
                  value={listMode}
                  onChange={(e) =>
                    setListMode(e.target.value as ScheduleList["mode"])
                  }
                >
                  <option value="parallel">
                    اجرایی؛ هم‌زمان با موقعیت‌های دیگر
                  </option>
                  <option value="alternative">
                    پیشنهادی؛ چیدمان جایگزین برای مقایسه
                  </option>
                </select>
              </Field>
            </div>
          )}
          <Notice>
            {(listId
              ? data.scheduleLists?.find((list) => list.id === listId)?.mode
              : listMode) === "alternative"
              ? "این فهرست یک چیدمان پیشنهادی مستقل است؛ استفادهٔ یک فرد در فهرست‌های دیگر مانع ساخت آن نیست. اعلان ویندوز فقط فهرست‌های اجرایی را اعلام می‌کند."
              : "می‌توانید چند فهرست با نام‌های مختلف برای یک بازه بسازید. در فهرست‌های اجرایی، افراد اصلی و رزرو نباید در یک ساعت در دو موقعیت باشند."}
          </Notice>
          <Field label="نام برنامه (اختیاری)">
            <input
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً برنامهٔ سالانهٔ تیم شب"
            />
          </Field>
          <div className="form-grid">
            <Field label="تاریخ شروع شمسی" hint="سال/ماه/روز؛ مثلاً ۱۴۰۵/۰۸/۲۳">
              <input
                required
                dir="ltr"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  updateEnd(e.target.value, days);
                }}
              />
            </Field>
            <Field label="تاریخ پایان شمسی">
              <input
                required
                dir="ltr"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  try {
                    setDays(
                      String(
                        dayDistance(
                          parseSolarInput(e.target.value),
                          parseSolarInput(startDate),
                        ) + 1,
                      ),
                    );
                  } catch {
                    /* Incomplete input. */
                  }
                }}
              />
            </Field>
            <Field
              label="تعداد روزهای برنامه"
              hint="برای یک روز، ۱ و برای یک سال معمولی، ۳۶۵ وارد کنید."
            >
              <input
                required
                type="number"
                min={1}
                max={3660}
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  updateEnd(startDate, e.target.value);
                }}
              />
            </Field>
            <div className="planning-shortcuts">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const date = solarInput(todayKey());
                  setStartDate(date);
                  updateEnd(date, days);
                }}
              >
                شروع از امروز
              </button>
              {[1, 365].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => {
                    setDays(String(n));
                    updateEnd(startDate, String(n));
                  }}
                >
                  {fa(n)} روز
                </button>
              ))}
            </div>
          </div>
          <div className="role-capacities">
            {(
              [
                ["leader", leaderCount, setLeaderCount],
                ["companion", companionCount, setCompanionCount],
                ["reserve", reserveCount, setReserveCount],
              ] as const
            ).map(([role, count, setCount]) => (
              <Field key={role} label={`تعداد ${roleLabels[role]} در هر نوبت`}>
                <input
                  required
                  type="number"
                  min={0}
                  max={2000}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hourly}
              onChange={(e) => setHourly(e.target.checked)}
            />
            تعریف شیفت ساعتی در هر روز
          </label>
          {hourly && (
            <div className="hourly-slots form-stack">
              {times.map((time, i) => (
                <div className="time-slot" key={i}>
                  <Field label={`ساعت شروع نوبت ${fa(i + 1)}`}>
                    <input
                      required
                      type="time"
                      value={time.startTime}
                      onChange={(e) =>
                        setTimes(
                          times.map((t, j) =>
                            i === j ? { ...t, startTime: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`ساعت پایان نوبت ${fa(i + 1)}`}>
                    <input
                      required
                      type="time"
                      value={time.endTime}
                      onChange={(e) =>
                        setTimes(
                          times.map((t, j) =>
                            i === j ? { ...t, endTime: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button danger"
                    disabled={times.length === 1}
                    aria-label={`حذف نوبت ${fa(i + 1)}`}
                    onClick={() => setTimes(times.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                disabled={times.length >= 24}
                onClick={() =>
                  setTimes([...times, { startTime: "16:00", endTime: "00:00" }])
                }
              >
                <Plus size={16} />
                افزودن نوبت ساعتی
              </button>
              <small>
                اگر ساعت پایان قبل از شروع باشد، پایان نوبت در روز بعد است.
                نوبت‌ها نباید هم‌پوشانی داشته باشند.
              </small>
            </div>
          )}
          <section className="planning-people">
            <div className="section-toolbar">
              <h3>افراد این برنامه · {fa(selected.length)} نفر</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSelected(
                    selected.length
                      ? []
                      : data.people.filter((p) => p.active).map((p) => p.id),
                  )
                }
              >
                {selected.length ? "برداشتن همه" : "انتخاب همه"}
              </button>
            </div>
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="جست‌وجوی افراد برنامه"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام، کد یا شماره تلفن"
              />
            </label>
            <div className="planning-people-list">
              {(
                [...Object.keys(roleLabels), "legacy"] as (
                  | PersonRole
                  | "legacy"
                )[]
              ).map((role) => {
                const people = data.people.filter(
                  (p) =>
                    p.active &&
                    (role === "legacy" ? !p.role : p.role === role) &&
                    latin(`${p.name} ${p.id} ${p.phone || ""}`).includes(
                      latin(query),
                    ),
                );
                return people.length ? (
                  <fieldset key={role}>
                    <legend>
                      {role === "legacy"
                        ? "فهرست‌های قبلی (مشترک)"
                        : roleLabels[role]}
                    </legend>
                    {people.map((p) => (
                      <label className="checkbox-label" key={p.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, p.id]
                                : selected.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>
                          {p.name}
                          <small>
                            {personRoleLabel(p)} · {fa(p.id)}
                          </small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : null;
              })}
            </div>
          </section>
          <Notice>
            برنامه‌های قبلی و سوابق سال‌های گذشته حفظ می‌شوند. برای تغییر
            برنامهٔ موجود، از «ویرایش نفرات شیفت» استفاده کنید. کمبود استراحت با
            هشدار در گزارش برنامه ثبت می‌شود.
          </Notice>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            disabled={busy}
            type="submit"
            className="button button-primary"
          >
            <WandSparkles size={17} />
            {busy ? "در حال ساخت…" : "ساخت برنامهٔ بازهٔ انتخابی"}
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

export function ShiftEditor({
  data,
  selectedKey,
  onSave,
  onClose,
}: {
  data: AppData;
  selectedKey: string;
  onSave: (next: AppData) => boolean;
  onClose: () => void;
}) {
  const shift = data.shifts.find((s) => (s.id || s.date) === selectedKey)!;
  const [leaders, setLeaders] = useState(shift?.leaders || []);
  const [companions, setCompanions] = useState(
    shift?.primary.filter((id) => !shift.leaders?.includes(id)) || [],
  );
  const [reserves, setReserves] = useState(shift?.reserve || []);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState("");
  if (!shift) return null;
  const selected = [...leaders, ...companions, ...reserves];
  return (
    <Modal
      title="ویرایش نفرات شیفت"
      subtitle={`${listName(data, shift)} · ${solarInput(shift.date)} · ${shift.startTime ? `${fa(shift.startTime)} تا ${fa(shift.endTime!)}` : "تمام روز"}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            if (
              onSave(
                editShift(
                  data,
                  selectedKey,
                  {
                    primary: [...leaders, ...companions],
                    leaders,
                    reserve: reserves,
                  },
                  note,
                  override,
                ),
              )
            )
              onClose();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <div className="modal-body form-stack">
          <Notice>
            تعداد و افراد هر نقش را می‌توانید تغییر دهید و یک نفر را در چند روز
            به‌صورت دستی قرار دهید. نام‌های قبلی و جدید و توضیح در تاریخچه ذخیره
            می‌شوند؛ سوابق حضور و غیاب حذف نمی‌شوند.
          </Notice>
          {(
            [
              ["leader", leaders, setLeaders],
              ["companion", companions, setCompanions],
              ["reserve", reserves, setReserves],
            ] as const
          ).map(([role, ids, setIds]) => (
            <section key={role} className="roster-editor-group">
              <div className="section-toolbar">
                <h3>{roleLabels[role]}</h3>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setIds([...ids, ""])}
                >
                  <Plus size={15} />
                  افزودن {roleLabels[role]}
                </button>
              </div>
              {ids.map((id, index) => (
                <div className="roster-edit-row" key={index}>
                  <Field label={`${roleLabels[role]} ${fa(index + 1)}`}>
                    <select
                      required
                      value={id}
                      onChange={(e) =>
                        setIds(
                          ids.map((v, i) => (i === index ? e.target.value : v)),
                        )
                      }
                    >
                      <option value="">انتخاب فرد</option>
                      {data.people
                        .filter((p) => p.active || selected.includes(p.id))
                        .map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={selected.includes(p.id) && p.id !== id}
                          >
                            {p.name} · {personRoleLabel(p)}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    aria-label={`حذف جایگاه ${roleLabels[role]} ${fa(index + 1)}`}
                    className="icon-button danger"
                    onClick={() => setIds(ids.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {!ids.length && (
                <p className="muted">برای این نقش جایگاهی تعیین نشده است.</p>
              )}
            </section>
          ))}
          <Field label="علت ویرایش نفرات">
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً تغییر با هماهنگی یا شیفت اضافه"
            />
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            تغییر دستی با وجود تداخل یا کمبود استراحت را تأیید می‌کنم (توضیح
            الزامی)
          </label>
          <small>
            خدمت واقعیِ نیروی رزرو را در «ثبت وضعیت» تأیید کنید تا به انتهای صف
            رزرو منتقل شود.
          </small>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="submit" className="button button-primary">
            <Check size={17} />
            ذخیرهٔ نفرات شیفت
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

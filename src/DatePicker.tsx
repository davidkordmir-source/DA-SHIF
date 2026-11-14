import { useId, useRef, useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  dayOfWeek,
  fa,
  monthDates,
  months,
  solar,
  solarLabel,
  weekdays,
} from "./lib/calendar";

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => solar(value));
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const move = (delta: number) => {
    const index = view.jy * 12 + view.jm - 1 + delta;
    const jy = Math.floor(index / 12),
      jm = (index % 12) + 1;
    if (jy >= 1300 && jy <= 1500) setView({ ...view, jy, jm });
  };
  return (
    <div
      className="field date-picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          root.current
            ?.querySelector<HTMLButtonElement>(".date-trigger")
            ?.focus();
        }
      }}
    >
      <span id={id}>{label}</span>
      <button
        type="button"
        className="date-trigger"
        aria-labelledby={id}
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={() => {
          setView(solar(value));
          setOpen(!open);
        }}
      >
        <span>{solarLabel(value)}</span>
        <CalendarDays size={18} />
      </button>
      {open && (
        <div
          id={`${id}-calendar`}
          className="date-popover"
          role="group"
          aria-label={`تقویم ${label}`}
        >
          <div className="date-month">
            <button
              type="button"
              aria-label="ماه قبل تقویم"
              onClick={() => move(-1)}
            >
              <ChevronRight size={18} />
            </button>
            <select
              aria-label="ماه تقویم"
              value={view.jm}
              onChange={(e) => setView({ ...view, jm: +e.target.value })}
            >
              {months.map((m, i) => (
                <option value={i + 1} key={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="سال تقویم"
              value={view.jy}
              onChange={(e) => setView({ ...view, jy: +e.target.value })}
            >
              {Array.from({ length: 201 }, (_, i) => 1300 + i).map((y) => (
                <option key={y} value={y}>
                  {fa(y)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="ماه بعد تقویم"
              onClick={() => move(1)}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="date-days">
            {weekdays.map((w) => (
              <small key={w} title={w}>
                {w.slice(0, 1)}
              </small>
            ))}
            {Array.from(
              { length: dayOfWeek(monthDates(view.jy, view.jm)[0]) },
              (_, i) => (
                <span key={`blank-${i}`} />
              ),
            )}
            {monthDates(view.jy, view.jm).map((d, i) => (
              <button
                type="button"
                key={d}
                aria-label={solarLabel(d, true)}
                aria-pressed={d === value}
                disabled={!!((min && d < min) || (max && d > max))}
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                  root.current
                    ?.querySelector<HTMLButtonElement>(".date-trigger")
                    ?.focus();
                }}
              >
                {fa(i + 1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

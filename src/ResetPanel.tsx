import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { AppData } from "./types";
import { Field, Modal, Notice } from "./components";
import { initialData } from "./lib/storage";

export function ResetPanel({
  onBackup,
  onReset,
}: {
  onBackup: () => void;
  onReset: (data: AppData) => boolean;
}) {
  const [open, setOpen] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [checked, setChecked] = useState(false),
    [text, setText] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="panel settings-panel reset-panel">
      <div className="settings-title">
        <RotateCcw size={21} />
        <div>
          <h2>بازگشت کامل به حالت پیش‌فرض</h2>
          <p>شروع دوباره با محیط خالی و تنظیمات اولیه.</p>
        </div>
      </div>
      <p className="body-text">
        همهٔ پرسنل، برنامه‌ها، بایگانی حق شیفت، محل‌های خدمت، مناسبت‌ها و
        یادآوری‌ها پاک می‌شوند و اندازهٔ نوشته و ظاهر به پیش‌فرض برمی‌گردد.
      </p>
      <button
        className="button button-danger"
        onClick={() => {
          setOpen(true);
          setDownloaded(false);
          setChecked(false);
          setText("");
          setError("");
        }}
      >
        بازنشانی کل نرم‌افزار
      </button>
      {open && (
        <Modal
          title="بازنشانی کامل نرم‌افزار"
          subtitle="این عملیات قابل برگشت نیست؛ بازیابی فقط با پشتیبان ممکن است."
          onClose={() => setOpen(false)}
        >
          <div className="modal-body form-stack">
            <Notice warning>
              تمام داده‌های این دستگاه، شامل دفتر حق شیفت و سوابق استراحت حذف
              می‌شوند. ابتدا پشتیبان را دریافت و در محل امن نگه دارید.
            </Notice>
            <button
              className="button button-secondary"
              onClick={() => {
                onBackup();
                setDownloaded(true);
              }}
            >
              ۱. دریافت پشتیبان قبل از بازنشانی
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={!downloaded}
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              پشتیبان را دریافت و بررسی کردم؛ حق شیفت و استراحت افراد ثبت و
              محفوظ است.
            </label>
            <Field label="برای تأیید بنویسید: بازنشانی کامل">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
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
              disabled={!downloaded || !checked || text !== "بازنشانی کامل"}
              onClick={() => {
                const defaults = initialData();
                if (
                  onReset({
                    version: 1,
                    demo: false,
                    people: [],
                    shifts: [],
                    swaps: [],
                    reserveChanges: [],
                    events: [],
                    settings: defaults.settings,
                  })
                )
                  setOpen(false);
                else setError("بازنشانی ذخیره نشد؛ اطلاعات فعلی حفظ شده‌اند.");
              }}
            >
              تأیید نهایی بازنشانی
            </button>
            <button
              className="button button-secondary"
              onClick={() => setOpen(false)}
            >
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

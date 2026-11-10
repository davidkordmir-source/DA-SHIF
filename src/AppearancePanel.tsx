import { useEffect, useState } from "react";
import {
  Check,
  Palette,
  Type,
  ImagePlus,
  FolderOpen,
  Monitor,
  Sparkles,
} from "lucide-react";
import { themes, fonts, type Appearance } from "./lib/appearance";
import logo from "../assets/hamshift.svg";
import { fa } from "./lib/calendar";

export function AppearancePanel({
  value,
  onChange,
  notify,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
  notify: (message: string) => void;
}) {
  const [branding, setBranding] = useState<{
    custom: boolean;
    fileName: string;
    logo: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [themeFilter, setThemeFilter] = useState("all");
  const [sample, setSample] = useState("یک تیم، یک ریتم");
  const visibleThemes = themes.filter(
    (t) =>
      themeFilter === "all" ||
      (themeFilter === "dark"
        ? t.dark
        : themeFilter === "light"
          ? !t.dark
          : ![
              "emerald",
              "violet",
              "ocean",
              "sunset",
              "rose",
              "midnight",
            ].includes(t.id)),
  );
  const refresh = () =>
    window.desktop
      ?.branding()
      .then(setBranding)
      .catch(() => notify("خواندن لوگوی شروع انجام نشد."));
  useEffect(() => {
    refresh();
  }, []);
  const choose = async () => {
    setBusy(true);
    try {
      const result = await window.desktop?.chooseLogo();
      if (result?.ok) {
        refresh();
        notify("لوگوی شروع تغییر کرد؛ در اجرای بعدی نمایش داده می‌شود.");
      } else if (result?.error) notify(result.error);
    } catch {
      notify("ذخیرهٔ لوگو انجام نشد. پوشهٔ نصب را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel appearance-panel">
      <div className="appearance-header">
        <span className="appearance-icon">
          <Palette size={25} />
        </span>
        <div>
          <div className="appearance-eyebrow">فضای کار، به سلیقهٔ شما</div>
          <h2>رنگ و حالِ هم‌شیفت شما</h2>
          <p>
            یک تم انتخاب کنید؛ رنگ‌ها، فونت و جزئیات در تمام برنامه هماهنگ
            می‌شوند.
          </p>
        </div>
        <Sparkles size={34} className="appearance-sparkle" />
      </div>
      <div className="appearance-content">
        <h3 className="appearance-label">
          <Palette size={17} />
          تم برنامه<span>{fa(themes.length)} طرح با رنگ و فرم متفاوت</span>
        </h3>
        <div className="appearance-filters" aria-label="گروه تم‌ها">
          {[
            ["all", "همهٔ طرح‌ها"],
            ["light", "روشن"],
            ["dark", "تیره"],
            ["special", "طرح‌های تازه"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={themeFilter === id ? "filter-active" : ""}
              onClick={() => setThemeFilter(id)}
              aria-pressed={themeFilter === id}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="theme-grid">
          {visibleThemes.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option ${value.theme === theme.id ? "theme-selected" : ""}`}
              onClick={() => onChange({ ...value, theme: theme.id })}
              aria-pressed={value.theme === theme.id}
              aria-label={`تم ${theme.name}`}
            >
              <span
                className="theme-preview"
                data-preview={theme.id}
                style={{ background: theme.surface, color: theme.primary }}
              >
                <span
                  className="theme-mini-sidebar"
                  style={{ background: theme.primary }}
                />
                <span className="theme-mini-content">
                  <i style={{ background: theme.ink }} />
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <b>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </b>
                </span>
                {value.theme === theme.id && (
                  <span
                    className="theme-check"
                    style={{
                      background: theme.primary,
                      color: theme.dark ? "#142722" : "white",
                    }}
                  >
                    <Check size={13} />
                  </span>
                )}
              </span>
              <strong>{theme.name}</strong>
              <small>{theme.note}</small>
            </button>
          ))}
        </div>
        <h3 className="appearance-label font-label">
          <Type size={18} />
          فونت فارسی<span>{fa(fonts.length)} سبک؛ همراه برنامه و آفلاین</span>
        </h3>
        <label className="font-test-input">
          <span>متن دلخواه برای مقایسهٔ فونت‌ها</span>
          <input
            value={sample}
            maxLength={70}
            onChange={(e) => setSample(e.target.value)}
            placeholder="جملهٔ دلخواهتان را بنویسید…"
          />
        </label>
        <div className="font-grid">
          {fonts.map((font) => (
            <button
              key={font.id}
              className={`font-option ${value.font === font.id ? "font-selected" : ""}`}
              style={{ fontFamily: `'${font.family}', Tahoma, sans-serif` }}
              onClick={() => onChange({ ...value, font: font.id })}
              aria-pressed={value.font === font.id}
              aria-label={`فونت ${font.name}`}
            >
              <span className="font-sample">{sample || "یک تیم، یک ریتم"}</span>
              <span>
                <strong>{font.name}</strong>
                <small>{font.note}</small>
                {value.font === font.id && <Check size={16} />}
              </span>
            </button>
          ))}
        </div>
        <div className="splash-settings">
          <div className="splash-mini">
            <span className="splash-mini-orbit" />
            <img src={branding?.logo || logo} alt="پیش‌نمایش لوگوی شروع" />
            <b>هم‌شیفت</b>
            <span className="splash-mini-loader" />
          </div>
          <div className="splash-settings-copy">
            <h3>
              <ImagePlus size={18} />
              لوگوی شما، در اولین نگاه
            </h3>
            <p>
              قبل از باز شدن برنامه، لوگوی دلخواهتان در صفحهٔ شروع نمایش داده
              می‌شود. فایل <b dir="ltr">splash-logo.png</b> را کنار{" "}
              <b dir="ltr">Hamshift.exe</b> قرار دهید؛ در اجرای بعدی خودکار
              خوانده می‌شود.
            </p>
            <small>
              فرمت‌های قابل قبول: PNG، JPG و WEBP · حداکثر ۵ مگابایت
            </small>
            {window.desktop ? (
              <div className="splash-buttons">
                <button
                  className="button button-primary"
                  onClick={choose}
                  disabled={busy}
                >
                  <ImagePlus size={16} />
                  انتخاب لوگوی شروع
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => window.desktop?.openInstallFolder()}
                >
                  <FolderOpen size={16} />
                  پوشهٔ نصب
                </button>
                {branding?.custom && (
                  <span className="custom-logo-badge">
                    <Check size={13} />
                    لوگوی شخصی فعال
                  </span>
                )}
              </div>
            ) : (
              <p className="desktop-feature-note">
                <Monitor size={16} />
                انتخاب لوگوی صفحهٔ شروع در نسخهٔ نصب‌شدهٔ ویندوز فعال است.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  CloudOff,
  FileSpreadsheet,
  FolderHeart,
  Grid2X2,
  LayoutDashboard,
  List,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  UserRoundCheck,
  UserRoundPlus,
  WandSparkles,
  X,
  XCircle,
  BarChart3,
  HardDriveDownload,
  FileUp,
  CircleCheck,
} from "lucide-react";
import type { AppData, AttendanceStatus, Person, Settings } from "./types";
import {
  Avatar,
  Badge,
  CheckLine,
  Empty,
  Field,
  Modal,
  Notice,
  Select,
  StatCard,
} from "./components";
import {
  dayDistance,
  dayOfWeek,
  eventsFor,
  fa,
  gregorianLabel,
  lunar,
  lunarLabel,
  monthDates,
  months,
  solar,
  solarInput,
  solarLabel,
  weekdays,
  parseSolarInput,
  latin,
} from "./lib/calendar";
import {
  applySwap,
  generateSchedule,
  personStats,
  recordAttendance,
} from "./lib/scheduler";
import {
  download,
  downloadTemplate,
  exportSchedule,
  readPeople,
} from "./lib/excel";
import { loadData, saveData, validateBackup } from "./lib/storage";

import logo from "../assets/hamshift.svg";
import { AppearancePanel } from "./AppearancePanel";
import { ReserveEditor, ReserveHistory } from "./ReserveEditor";
import { defaultAppearance, themes } from "./lib/appearance";
import { hasIranCalendar, CALENDAR_ANNUAL_YEAR } from "./lib/iran-calendar";
import { useToday } from "./lib/use-today";

type Page =
  | "schedule"
  | "people"
  | "attendance"
  | "swaps"
  | "reserves"
  | "reports"
  | "settings";
type Dialog =
  | null
  | "import"
  | "generate"
  | "swap"
  | "attendance"
  | "reserve"
  | "person"
  | "help"
  | "event"
  | "profile"
  | "alerts";
const nav: { id: Page; title: string; icon: typeof CalendarDays }[] = [
  { id: "schedule", title: "برنامهٔ شیفت‌ها", icon: CalendarDays },
  { id: "people", title: "پرسنل", icon: Users },
  { id: "attendance", title: "حضور و غیاب", icon: ClipboardCheck },
  { id: "swaps", title: "جابه‌جایی شیفت", icon: ArrowLeftRight },
  { id: "reserves", title: "نیروهای رزرو", icon: ShieldCheck },
  { id: "reports", title: "گزارش‌ها و عدالت", icon: BarChart3 },
];
const statusLabels = {
  present: "حاضر",
  excused: "غیبت موجه",
  unexcused: "غیبت غیرموجه",
};

export default function App() {
  const [loaded] = useState(loadData);
  const [data, setData] = useState<AppData>(loaded.data);
  const appearance = data.appearance || defaultAppearance;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.font = appearance.font;
    document.documentElement.style.colorScheme = themes.find(
      (t) => t.id === appearance.theme,
    )?.dark
      ? "dark"
      : "light";
  }, [appearance.theme, appearance.font]);
  useEffect(() => {
    document.fonts.ready.then(() => window.desktop?.ready());
  }, []);

  const [storageError, setStorageError] = useState(loaded.error || "");
  const [page, setPage] = useState<Page>("schedule");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const today = useToday(),
    nowSolar = solar(today);
  const [year, setYear] = useState(nowSolar.jy),
    [month, setMonth] = useState(nowSolar.jm);
  const [selectedDate, setSelectedDate] = useState(today);
  const [detailOpen, setDetailOpen] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [calendar, setCalendar] = useState("solar");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState("");
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [imported, setImported] = useState<Person[]>([]),
    [importErrors, setImportErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [swapForm, setSwapForm] = useState({
    firstDate: today,
    secondDate: today,
    firstId: "",
    secondId: "",
    note: "",
  });
  const [attendanceForm, setAttendanceForm] = useState<{
    date: string;
    personId: string;
    status: AttendanceStatus;
    note: string;
    replacementId: string;
  }>({
    date: today,
    personId: "",
    status: "present",
    note: "",
    replacementId: "",
  });
  const [reserveEditDate, setReserveEditDate] = useState(today);
  const [releaseReserveId, setReleaseReserveId] = useState("");
  const [personForm, setPersonForm] = useState({
    id: "",
    name: "",
    department: "",
    reserveOnly: false,
  });
  const [eventForm, setEventForm] = useState({
    date: solarInput(today),
    title: "",
    holiday: true,
    override: false,
  });
  const [eventEditing, setEventEditing] = useState<number | null>(null);
  const importInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<AppData | null>(
    null,
  );
  const dates = useMemo(() => monthDates(year, month), [year, month]);
  const publishedCalendar = dates.every(hasIranCalendar);
  const generateResult = data.schedulingWarnings?.[dates[0]] || [];
  const monthShifts = useMemo(
    () => data.shifts.filter((s) => dates.includes(s.date)),
    [data.shifts, dates],
  );
  const monthEvents = dates
    .map((date) => ({
      date,
      ...eventsFor(date, data.events, data.settings.hijriOffset),
    }))
    .filter((e) => e.events.length);
  const activePeople = data.people.filter((p) => p.active);
  const normalPeople = activePeople.filter((p) => !p.reserveOnly);
  const holidays = dates.filter(
    (d) => eventsFor(d, data.events, data.settings.hijriOffset).holiday,
  );
  const monthStats = data.people.map((p) => ({
    ...p,
    stats: personStats(p.id, monthShifts, data),
  }));
  const totals = normalPeople.map(
    (p) => personStats(p.id, monthShifts, data).total,
  );
  const holidayTotals = normalPeople.map(
    (p) => personStats(p.id, monthShifts, data).holiday,
  );
  const totalSpread = totals.length
    ? Math.max(...totals) - Math.min(...totals)
    : 0;
  const holidaySpread = holidayTotals.length
    ? Math.max(...holidayTotals) - Math.min(...holidayTotals)
    : 0;
  const searchable = (value: string) =>
    latin(value)
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/‌/g, " ")
      .trim()
      .toLowerCase();
  const searchMatches = (p: Person) =>
    searchable(`${p.name} ${p.id} ${p.department}`).includes(searchable(query));
  const person = (id: string) => data.people.find((p) => p.id === id);
  const name = (id: string) => person(id)?.name || "فرد حذف‌شده";
  const showToast = (message: string) => setToast(message);
  const open = (d: Dialog) => {
    setError("");
    setDialog(d);
  };
  const close = () => {
    setDialog(null);
    setError("");
  };
  const commit = (next: AppData, message?: string, recovering = false) => {
    if (storageError && !recovering) {
      setError(storageError);
      showToast(
        "ذخیره‌سازی متوقف است. از بخش تنظیمات نسخهٔ پشتیبان بازیابی کنید.",
      );
      return false;
    }
    try {
      saveData(next);
      setData(next);
      if (recovering) setStorageError("");
      if (message) showToast(message);
      return true;
    } catch {
      const msg =
        "ذخیره‌سازی انجام نشد؛ فضای دستگاه یا دسترسی به حافظه را بررسی و نسخهٔ پشتیبان دریافت کنید.";
      setError(msg);
      showToast(msg);
      return false;
    }
  };
  useEffect(() => {
    if (!loaded.error) {
      try {
        saveData(loaded.data);
      } catch {
        setStorageError(
          "ذخیرهٔ داده‌ها در دستگاه ممکن نیست. فضای آزاد و دسترسی نوشتن را بررسی کنید.",
        );
      }
    }
  }, [loaded]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const changeMonth = (step: number) => {
    let m = month + step,
      y = year;
    if (m < 1) {
      m = 12;
      y--;
    }
    if (m > 12) {
      m = 1;
      y++;
    }
    if (y < 1300 || y > 1500) return;
    setMonth(m);
    setYear(y);
    setDetailOpen(false);
  };
  const openProfile = (id: string) => {
    setPersonId(id);
    open("profile");
  };
  const startAttendance = (date: string, id: string) => {
    setReleaseReserveId("");
    const a = data.shifts
      .find((s) => s.date === date)
      ?.attendance.find((a) => a.personId === id);
    setAttendanceForm({
      date,
      personId: id,
      status: a?.status || "present",
      note: a?.note || "",
      replacementId: a?.replacementId || "",
    });
    open("attendance");
  };
  const startSwap = (date = selectedDate) => {
    setSwapForm({
      firstDate: date,
      secondDate: date,
      firstId: "",
      secondId: "",
      note: "",
    });
    open("swap");
  };
  const startReserveEdit = (requested = selectedDate) => {
    const date = data.shifts.some((s) => s.date === requested)
      ? requested
      : monthShifts[0]?.date || data.shifts[0]?.date || requested;
    setReserveEditDate(date);
    open("reserve");
  };
  const startEvent = (date = selectedDate, index: number | null = null) => {
    const e = index !== null ? data.events[index] : null;
    setEventEditing(index);
    setEventForm({
      date: solarInput(e?.date || date),
      title: e?.title || "",
      holiday: e?.holiday ?? true,
      override: e?.override ?? false,
    });
    open("event");
  };
  const handleGenerate = () => {
    try {
      if (
        monthShifts.some((s) => s.attendance.length) ||
        data.swaps.some(
          (s) => dates.includes(s.firstDate) || dates.includes(s.secondDate),
        ) ||
        data.reserveChanges?.some((c) => dates.includes(c.date))
      )
        throw new Error(
          "این ماه سابقهٔ حضور، غیبت، جابه‌جایی یا ویرایش رزرو دارد. برای حفظ سوابق، بازتولید مجاز نیست. ماه دیگری انتخاب کنید.",
        );
      const result = generateSchedule(data, year, month);
      if (
        commit(
          {
            ...data,
            shifts: result.shifts,
            schedulingWarnings: {
              ...data.schedulingWarnings,
              [dates[0]]: result.warnings,
            },
          },
          "برنامهٔ ماه با موفقیت ساخته و ذخیره شد.",
        )
      )
        close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const handleExcel = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setImported([]);
    setImportErrors([]);
    setFileName(file.name);
    try {
      const result = await readPeople(file);
      setImported(result.people);
      setImportErrors(result.errors);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  };
  const applyImport = () => {
    let people = data.demo ? [] : [...data.people];
    for (const p of imported) {
      let i = people.findIndex((q) => q.id === p.id);
      if (i < 0 && p.id.startsWith("name:")) {
        const matches = people
          .map((q, index) => ({ q, index }))
          .filter(({ q }) => searchable(q.name) === searchable(p.name));
        if (matches.length > 1) {
          setError(`برای نام همسان «${p.name}» کد پرسنلی یکتا وارد کنید.`);
          return;
        }
        if (matches.length === 1) i = matches[0].index;
      }
      if (i >= 0) people[i] = { ...p, id: people[i].id };
      else people.push(p);
    }
    const next = {
      ...data,
      people,
      demo: false,
      ...(data.demo
        ? { shifts: [], swaps: [], reserveChanges: [], schedulingWarnings: {} }
        : {}),
    };
    if (
      commit(
        next,
        `${fa(imported.length)} نفر از اکسل وارد شدند. برای آن‌ها برنامه بسازید.`,
      )
    ) {
      setImported([]);
      setFileName("");
      close();
      setPage("people");
    }
  };
  const handleExport = async () => {
    setBusy(true);
    try {
      await exportSchedule(data, dates);
      showToast("فایل اکسل برنامه و گزارش‌ها آماده شد.");
    } catch {
      showToast("ساخت خروجی اکسل انجام نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };
  const backup = () => {
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `hamshift-backup-${today}.json`,
    );
    showToast("نسخهٔ پشتیبان شامل تمام پرسنل و سوابق دریافت شد.");
  };
  const handleRestore = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("حداکثر حجم پشتیبان ۱۰ مگابایت است.");
      const candidate = validateBackup(JSON.parse(await file.text()));
      setRestoreCandidate(candidate);
    } catch (e) {
      showToast((e as Error).message);
    }
    if (backupInput.current) backupInput.current.value = "";
  };

  const pageTitles: Record<Page, [string, string]> = {
    schedule: [
      "برنامهٔ شیفت‌ها",
      "برنامه‌ریزی منظم، تقسیم عادلانه و یک تیم هماهنگ.",
    ],
    people: ["پرسنل", "همهٔ اعضای تیم و سابقهٔ شیفت‌هایشان، در یک نگاه."],
    attendance: [
      "حضور و غیاب",
      "ثبت حضور، غیبت موجه و غیرموجه و جایگزینی از رزرو.",
    ],
    swaps: [
      "جابه‌جایی شیفت",
      "هر تغییری با نام افراد و تاریخ دقیق ثبت می‌شود.",
    ],
    reserves: [
      "نیروهای رزرو",
      "همیشه برای اتفاق‌های پیش‌بینی‌نشده آماده باشید.",
    ],
    reports: [
      "گزارش‌ها و عدالت",
      "توزیع شیفت‌ها را با عدد و جزئیات بررسی کنید.",
    ],
    settings: ["تنظیمات", "قواعد شیفت‌بندی، تقویم و نگهداری امن داده‌ها."],
  };
  const monthControls = (
    <div className="month-navigation">
      <button
        className="icon-button"
        onClick={() => changeMonth(-1)}
        aria-label="ماه قبل"
      >
        <ChevronRight size={18} />
      </button>
      <strong>
        {months[month - 1]} <span>{fa(year)}</span>
      </strong>
      <button
        className="icon-button"
        onClick={() => changeMonth(1)}
        aria-label="ماه بعد"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="today-button"
        onClick={() => {
          setYear(nowSolar.jy);
          setMonth(nowSolar.jm);
          setSelectedDate(today);
        }}
      >
        امروز
      </button>
    </div>
  );
  const filteredShifts = monthShifts
    .filter(
      (s) =>
        filter !== "holiday" ||
        eventsFor(s.date, data.events, data.settings.hijriOffset).holiday,
    )
    .filter(
      (s) =>
        !query ||
        [...s.primary, ...s.reserve].some(
          (id) => person(id) && searchMatches(person(id)!),
        ),
    );
  const profilePerson = person(personId);
  const attendanceShift = data.shifts.find(
    (s) => s.date === attendanceForm.date,
  );
  const outsideReserve =
    !!attendanceForm.replacementId &&
    !!attendanceShift &&
    !attendanceShift.reserve.includes(attendanceForm.replacementId);
  const priorShifts = useMemo(
    () => data.shifts.filter((s) => s.date < dates[0]),
    [data.shifts, dates],
  );
  const priorMonthCount = useMemo(
    () => new Set(priorShifts.map((s) => solarInput(s.date).slice(0, 7))).size,
    [priorShifts],
  );
  const priorStats = useMemo(
    () =>
      new Map(
        data.people.map((p) => [p.id, personStats(p.id, priorShifts, data)]),
      ),
    [data.people, priorShifts, data.settings, data.events],
  );

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="nav-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="بستن منو"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("schedule");
          }}
        >
          <span className="brand-mark">
            <img src={logo} alt="لوگوی هم‌شیفت" />
          </span>
          <span>
            <b>
              هم‌شیفت<span className="brand-dot">.</span>
            </b>
            <small>مدیریت هوشمند شیفت‌ها</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">
            <Users size={17} />
          </span>
          <div>
            <strong>فضای کاری من</strong>
            <small>مدیریت پرسنل</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <p className="nav-caption">میز کار</p>
        <nav aria-label="منوی اصلی">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "nav-active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setQuery("");
                setMobileMenu(false);
              }}
            >
              <item.icon size={19} />
              <span>{item.title}</span>
              {item.id === "people" && <small>{fa(activePeople.length)}</small>}
              {item.id === "schedule" && page === item.id && (
                <span className="nav-active-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-card">
            <span className="offline-card-icon">
              <CloudOff size={20} />
            </span>
            <strong>آفلاین، اما همیشه آماده</strong>
            <p>اطلاعات تیم شما فقط در همین دستگاه نگهداری می‌شود.</p>
            <span>
              <i />
              بدون نیاز به اینترنت
            </span>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "nav-active" : ""}`}
            onClick={() => {
              setPage("settings");
              setMobileMenu(false);
              setSettings(data.settings);
            }}
          >
            <Settings2 size={19} />
            تنظیمات
          </button>
          <button className="nav-item" onClick={() => open("help")}>
            <CircleHelp size={19} />
            راهنمای استفاده
            <ArrowLeft size={15} className="push-left" />
          </button>
          <div className="sidebar-footer">
            <span className="admin-avatar">م</span>
            <div>
              <b>مدیر سیستم</b>
              <small>فضای کاری شخصی</small>
            </div>
            <span className="version">۲.۲</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileMenu(true)}
              aria-label="باز کردن منو"
            >
              <Menu size={22} />
            </button>
            <LayoutDashboard size={16} />
            <span>میز کار</span>
            <ChevronLeft size={13} />
            <b>{pageTitles[page][0]}</b>
          </div>
          <div className="topbar-left">
            <span className="topbar-date">
              <CalendarDays size={15} />
              {solarLabel(today, true)}
            </span>
            <span className="local-status">
              <i />
              ذخیرهٔ محلی
            </span>
            <button
              className="icon-button notification-button"
              onClick={() => open("alerts")}
              aria-label="اعلان‌ها"
            >
              <Bell size={19} />
              {generateResult.length > 0 && <i />}
            </button>
            <button
              className="top-avatar"
              onClick={() => {
                setPage("settings");
                setSettings(data.settings);
              }}
              aria-label="تنظیمات حساب"
            >
              م
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                همه‌چیز برای یک برنامهٔ بهتر
              </div>
              <h1>
                {pageTitles[page][0]}
                <span className="heading-dot">.</span>
              </h1>
              <p>{pageTitles[page][1]}</p>
            </div>
            <div className="heading-actions">
              {page === "schedule" ? (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setImported([]);
                      setImportErrors([]);
                      setFileName("");
                      open("import");
                    }}
                  >
                    <Upload size={17} />
                    ورود پرسنل از اکسل
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => open("generate")}
                  >
                    <WandSparkles size={18} />
                    ایجاد برنامهٔ عادلانه
                  </button>
                </>
              ) : page === "people" ? (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setImported([]);
                      setImportErrors([]);
                      open("import");
                    }}
                  >
                    <FileSpreadsheet size={17} />
                    ورود از اکسل
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setPersonForm({
                        id: "",
                        name: "",
                        department: "",
                        reserveOnly: false,
                      });
                      open("person");
                    }}
                  >
                    <Plus size={18} />
                    افزودن پرسنل
                  </button>
                </>
              ) : page === "swaps" ? (
                <button
                  className="button button-primary"
                  onClick={() => startSwap()}
                >
                  <Plus size={18} />
                  ثبت جابه‌جایی
                </button>
              ) : page === "reserves" ? (
                <>
                  <button
                    className="button button-primary"
                    onClick={() =>
                      startReserveEdit(
                        monthShifts.find((s) => s.date === selectedDate)
                          ?.date ||
                          monthShifts[0]?.date ||
                          selectedDate,
                      )
                    }
                  >
                    <ShieldCheck size={17} />
                    ویرایش رزروهای روز
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={handleExport}
                  >
                    <ArrowDownToLine size={17} />
                    خروجی اکسل
                  </button>
                </>
              ) : page === "reports" || page === "attendance" ? (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={handleExport}
                >
                  <ArrowDownToLine size={17} />
                  خروجی اکسل
                </button>
              ) : (
                <button className="button button-secondary" onClick={backup}>
                  <HardDriveDownload size={18} />
                  دریافت پشتیبان
                </button>
              )}
            </div>
          </div>
          {storageError && <Notice warning>{storageError}</Notice>}
          {data.demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={16} />
                <b>یک نگاه به هم‌شیفت</b>
                <span>
                  این برنامه با اسامی نمونه ساخته شده؛ تیم خودتان را از اکسل
                  وارد کنید.
                </span>
              </span>
              <button
                onClick={() => {
                  setImported([]);
                  setImportErrors([]);
                  open("import");
                }}
              >
                شروع با تیم من
                <ArrowLeft size={14} />
              </button>
            </div>
          )}

          {page === "schedule" && (
            <>
              <section className="stats-grid" aria-label="آمار ماه">
                <StatCard
                  label="پرسنل فعال"
                  value={activePeople.length}
                  unit="نفر"
                  icon={<Users size={20} />}
                  foot={
                    <>
                      <span className="little-dot green" />
                      آمادهٔ برنامه‌ریزی
                    </>
                  }
                />
                <StatCard
                  label="شیفت‌های این ماه"
                  value={monthShifts.reduce((n, s) => n + s.primary.length, 0)}
                  unit="نفر ـ روز"
                  icon={<CalendarRange size={20} />}
                  tone="blue"
                  foot={<>{fa(monthShifts.length)} روز برنامه‌ریزی‌شده</>}
                />
                <StatCard
                  label="روزهای تعطیل"
                  value={holidays.length}
                  unit="روز"
                  icon={<FolderHeart size={20} />}
                  tone="amber"
                  foot={<>با احتساب جمعه‌ها و مناسبت‌ها</>}
                />
                <StatCard
                  label="توزیع شیفت تعطیل"
                  value={monthShifts.length ? holidaySpread : "—"}
                  unit="اختلاف"
                  icon={<ShieldCheck size={20} />}
                  foot={
                    <span
                      className={
                        holidaySpread <= 1 ? "green-text" : "amber-text"
                      }
                    >
                      {monthShifts.length
                        ? holidaySpread <= 1
                          ? "متعادل بین نیروهای اصلی"
                          : "گزارش عدالت را بررسی کنید"
                        : "پس از ایجاد برنامه محاسبه می‌شود"}
                    </span>
                  }
                />
              </section>
              {generateResult.length > 0 && (
                <Notice warning>
                  در {fa(generateResult.length)} جایگاه، فاصلهٔ استراحت قابل
                  رعایت نبود. تعداد نیروها یا فاصلهٔ استراحت را در تنظیمات تغییر
                  دهید.
                </Notice>
              )}
              <div className="schedule-layout">
                <section className="panel calendar-panel">
                  <div className="calendar-top">
                    <div className="calendar-title">
                      <span className="panel-icon">
                        <CalendarDays size={19} />
                      </span>
                      <h2>تقویم شیفت‌ها</h2>
                      <Badge tone="gray">شیفت روزانه</Badge>
                    </div>
                    <div className="calendar-actions">
                      <button
                        className="text-button export-button"
                        disabled={busy}
                        onClick={handleExport}
                      >
                        <ArrowDownToLine size={16} />
                        خروجی اکسل
                      </button>
                      <div className="view-switch">
                        <button
                          className={view === "calendar" ? "selected" : ""}
                          aria-label="نمای تقویم"
                          onClick={() => setView("calendar")}
                        >
                          <Grid2X2 size={16} />
                        </button>
                        <button
                          className={view === "list" ? "selected" : ""}
                          aria-label="نمای فهرست"
                          onClick={() => setView("list")}
                        >
                          <List size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="calendar-toolbar">
                    <div>
                      {monthControls}
                      <p className="alternate-range" dir="ltr">
                        {gregorianLabel(dates[0])} —{" "}
                        {gregorianLabel(dates[dates.length - 1])}
                      </p>
                    </div>
                    <div className="calendar-filters">
                      <Select
                        value={calendar}
                        onChange={(e) => setCalendar(e.target.value)}
                        aria-label="تقویم نمایشی"
                      >
                        <option value="solar">تقویم شمسی</option>
                        <option value="gregorian">تقویم میلادی</option>
                        <option value="lunar">تقویم قمری</option>
                      </Select>
                      <Select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        aria-label="فیلتر روزها"
                      >
                        <option value="all">همهٔ روزها</option>
                        <option value="holiday">روزهای تعطیل</option>
                      </Select>
                    </div>
                  </div>
                  {view === "calendar" ? (
                    <div className="calendar-scroll">
                      <div
                        className="calendar-grid"
                        role="grid"
                        aria-label={`برنامهٔ ${months[month - 1]} ${fa(year)}`}
                      >
                        <div className="weekday-row" role="row">
                          {weekdays.map((w, i) => (
                            <div
                              role="columnheader"
                              className={i === 6 ? "friday" : ""}
                              key={w}
                            >
                              {w}
                            </div>
                          ))}
                        </div>
                        <div className="days-grid">
                          {Array.from(
                            { length: dayOfWeek(dates[0]) },
                            (_, i) => (
                              <div
                                className="day-cell outside"
                                key={`before-${i}`}
                              >
                                <span className="outside-number">
                                  {fa(
                                    solar(
                                      new Date(
                                        new Date(
                                          `${dates[0]}T12:00:00Z`,
                                        ).getTime() -
                                          (dayOfWeek(dates[0]) - i) * 86400000,
                                      )
                                        .toISOString()
                                        .slice(0, 10),
                                    ).jd,
                                  )}
                                </span>
                              </div>
                            ),
                          )}
                          {dates.map((date) => {
                            const shift = data.shifts.find(
                                (s) => s.date === date,
                              ),
                              info = eventsFor(
                                date,
                                data.events,
                                data.settings.hijriOffset,
                              ),
                              j = solar(date);
                            const dim = filter === "holiday" && !info.holiday;
                            const number =
                              calendar === "solar"
                                ? j.jd
                                : calendar === "gregorian"
                                  ? Number(date.slice(-2))
                                  : lunar(date, data.settings.hijriOffset).day;
                            return (
                              <button
                                role="gridcell"
                                key={date}
                                className={`day-cell ${info.holiday ? "holiday-cell" : ""} ${date === today ? "today-cell" : ""} ${dim ? "dim-cell" : ""} ${date === selectedDate && detailOpen ? "day-selected" : ""}`}
                                onClick={() => {
                                  setSelectedDate(date);
                                  setDetailOpen(true);
                                }}
                                aria-label={`${solarLabel(date, true)}${info.holiday ? "، تعطیل" : ""}`}
                              >
                                <div className="day-number-row">
                                  <span
                                    className={`day-number ${date === today ? "is-today" : ""}`}
                                  >
                                    {fa(number)}
                                  </span>
                                  {date === today ? (
                                    <span className="today-label">امروز</span>
                                  ) : info.events.length > 0 ? (
                                    <span
                                      className={`event-dot ${info.holiday ? "event-dot-red" : ""}`}
                                    />
                                  ) : null}
                                </div>
                                <div className="shift-names">
                                  {shift?.primary.map((id, i) => (
                                    <span
                                      className={`shift-chip chip-${i % 2}`}
                                      key={id}
                                    >
                                      <span />
                                      {name(id)
                                        .split(" ")
                                        .slice(0, 2)
                                        .join(" ")}
                                    </span>
                                  ))}
                                </div>
                                {shift && shift.reserve.length > 0 ? (
                                  <span className="reserve-count">
                                    <span className="mini-reserve-dot" />
                                    {fa(shift.reserve.length)} نفر رزرو
                                  </span>
                                ) : !shift ? (
                                  <span className="no-shift">بدون برنامه</span>
                                ) : null}
                                {info.events.length > 0 && (
                                  <span className="cell-event">
                                    {info.events[0].title}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {Array.from(
                            {
                              length:
                                (7 -
                                  ((dayOfWeek(dates[0]) + dates.length) % 7)) %
                                7,
                            },
                            (_, i) => (
                              <div
                                className="day-cell outside"
                                key={`after-${i}`}
                              >
                                <span className="outside-number">
                                  {fa(i + 1)}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ShiftTable
                      shifts={filteredShifts}
                      name={name}
                      events={(date) =>
                        eventsFor(date, data.events, data.settings.hijriOffset)
                          .holiday
                      }
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setDetailOpen(true);
                      }}
                    />
                  )}
                  <div className="calendar-footer">
                    <div>
                      <span>
                        <i className="legend-dot green" />
                        نیروی اصلی
                      </span>
                      <span>
                        <i className="legend-dot gray" />
                        نیروی رزرو
                      </span>
                      <span>
                        <i className="legend-dot red" />
                        روز تعطیل
                      </span>
                    </div>
                    <span>برای جزئیات، روی روز موردنظر بزنید.</span>
                  </div>
                </section>
                <aside className="schedule-aside">
                  <div className="balance-card">
                    <div className="balance-heading">
                      <span>
                        <ShieldCheck size={21} />
                      </span>
                      <Badge>عدالت در برنامه‌ریزی</Badge>
                    </div>
                    <h3>سهم برابر، تیم همراه</h3>
                    <p>
                      شیفت‌های عادی، تعطیلات و روزهای هفته، با در نظر گرفتن
                      سابقهٔ افراد تقسیم می‌شوند.
                    </p>
                    <div className="balance-meter">
                      <span
                        style={{
                          width: `${monthShifts.length ? Math.max(15, 100 - holidaySpread * 12 - totalSpread * 5) : 0}%`,
                        }}
                      />
                    </div>
                    <div className="balance-meter-label">
                      <span>اختلاف شیفت تعطیل</span>
                      <b>{fa(holidaySpread)} شیفت</b>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("reports")}
                    >
                      مشاهدهٔ گزارش عدالت
                      <ArrowLeft size={15} />
                    </button>
                  </div>
                  <div className="panel occasions-panel">
                    <div className="aside-title">
                      <h3>
                        <CalendarDays size={17} />
                        مناسبت‌های ماه
                      </h3>
                      <span>{fa(monthEvents.length)}</span>
                    </div>
                    {monthEvents.length ? (
                      monthEvents.slice(0, 4).map((e) => (
                        <button
                          className="occasion"
                          key={e.date}
                          onClick={() => {
                            setSelectedDate(e.date);
                            setDetailOpen(true);
                          }}
                        >
                          <span
                            className={`occasion-date ${e.holiday ? "occasion-holiday" : ""}`}
                          >
                            <b>{fa(solar(e.date).jd)}</b>
                            <small>{months[month - 1]}</small>
                          </span>
                          <span>
                            <strong>{e.events[0].title}</strong>
                            <small>
                              {weekdays[dayOfWeek(e.date)]}
                              {e.holiday ? " · تعطیل" : ""}
                            </small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="aside-empty">
                        مناسبت ثابتی برای این ماه ثبت نشده است.
                      </p>
                    )}
                    <button
                      className="text-button aside-more"
                      onClick={() => startEvent(dates[0])}
                    >
                      <Plus size={15} />
                      افزودن مناسبت
                    </button>
                    <p className="lunar-note">
                      {publishedCalendar
                        ? `تقویم ایران؛ داده‌های قمری تا پایان ${fa(CALENDAR_ANNUAL_YEAR)} همراه برنامه است.`
                        : "این بازه جدول قمریِ تأییدشده ندارد؛ تاریخ‌ها برآوردی‌اند."}
                    </p>
                  </div>
                  <div className="backup-card">
                    <span>
                      <HardDriveDownload size={22} />
                    </span>
                    <div>
                      <strong>یک نسخهٔ امن، همیشه</strong>
                      <p>از اطلاعات تیم پشتیبان بگیرید.</p>
                      <button onClick={backup}>
                        دریافت نسخهٔ پشتیبان
                        <ArrowLeft size={14} />
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
              <div className="bottom-note">
                <span>
                  <ShieldCheck size={15} />
                  اطلاعات شما خصوصی می‌ماند؛ هیچ داده‌ای به اینترنت ارسال
                  نمی‌شود.
                </span>
                <span>
                  با دقت برای تیم شما<span className="tiny-heart">♡</span>
                </span>
              </div>
            </>
          )}

          {page === "people" && (
            <section className="panel">
              <div className="section-toolbar">
                <div>
                  <h2>
                    اعضای تیم{" "}
                    <Badge tone="gray">{fa(data.people.length)} نفر</Badge>
                  </h2>
                  <p>برای مشاهدهٔ پرونده و شیفت بعدی، روی نام فرد بزنید.</p>
                </div>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="جست‌وجوی نام، کد یا واحد..."
                />
              </div>
              {data.people.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>نام و نام خانوادگی</th>
                        <th>کد پرسنلی</th>
                        <th>واحد</th>
                        <th>نوع همکاری</th>
                        <th>شیفت بعدی</th>
                        <th>وضعیت</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.filter(searchMatches).map((p, i) => {
                        const next = data.shifts
                          .filter(
                            (s) => s.date >= today && s.primary.includes(p.id),
                          )
                          .sort((a, b) => a.date.localeCompare(b.date))[0];
                        return (
                          <tr key={p.id}>
                            <td>
                              <button
                                className="person-cell"
                                onClick={() => openProfile(p.id)}
                              >
                                <Avatar person={p} index={i} />
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>مشاهدهٔ پرونده</small>
                                </span>
                              </button>
                            </td>
                            <td dir="ltr">
                              {fa(p.id.startsWith("name:") ? "—" : p.id)}
                            </td>
                            <td>{p.department || "—"}</td>
                            <td>
                              {p.reserveOnly ? "فقط رزرو" : "اصلی و رزرو"}
                            </td>
                            <td>
                              {next ? (
                                <>
                                  <span>{solarLabel(next.date)}</span>
                                  <small className="block muted">
                                    {dayDistance(next.date, today) === 0
                                      ? "امروز"
                                      : `${fa(dayDistance(next.date, today))} روز دیگر`}
                                  </small>
                                </>
                              ) : (
                                <span className="muted">
                                  برنامه‌ای ثبت نشده
                                </span>
                              )}
                            </td>
                            <td>
                              <Badge tone={p.active ? "green" : "gray"}>
                                {p.active ? "فعال" : "غیرفعال"}
                              </Badge>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() =>
                                  commit(
                                    {
                                      ...data,
                                      people: data.people.map((q) =>
                                        q.id === p.id
                                          ? { ...q, active: !q.active }
                                          : q,
                                      ),
                                    },
                                    p.active
                                      ? "فرد غیرفعال شد؛ سوابق و برنامه‌های قبلی محفوظ است."
                                      : "فرد فعال شد.",
                                  )
                                }
                              >
                                {p.active ? "غیرفعال کردن" : "فعال کردن"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!data.people.filter(searchMatches).length && (
                    <Empty
                      title="نتیجه‌ای پیدا نشد"
                      text="نام، کد یا واحد دیگری را جست‌وجو کنید."
                    />
                  )}
                </div>
              ) : (
                <Empty
                  title="تیم خود را اضافه کنید"
                  text="با ورود فایل اکسل یا افزودن دستی شروع کنید."
                  action={
                    <button
                      className="button button-primary"
                      onClick={() => open("import")}
                    >
                      ورود اکسل
                    </button>
                  }
                />
              )}
            </section>
          )}

          {(page === "attendance" || page === "reserves") && (
            <section className="panel">
              <div className="section-toolbar">
                {monthControls}
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="جست‌وجوی نام پرسنل..."
                />
              </div>
              <Notice>
                {page === "attendance"
                  ? "حضور به‌صورت خودکار فرض نمی‌شود. برای هر نفر وضعیت را ثبت کنید؛ در صورت غیبت، می‌توانید نیروی رزرو همان روز را جایگزین کنید."
                  : "رزرو هر روز را می‌توانید از همهٔ پرسنل فعال انتخاب و ویرایش کنید. از «ویرایش رزروهای روز» استفاده کنید؛ هنگام ثبت غیبت هم انتخاب فردی خارج از رزروهای فعلی ممکن است."}
              </Notice>
              {monthShifts.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>روز</th>
                        <th>
                          {page === "reserves" ? "نیروی رزرو" : "نیروی اصلی"}
                        </th>
                        <th>وضعیت</th>
                        <th>{page === "reserves" ? "جایگزینِ" : "جایگزین"}</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthShifts.flatMap((s) =>
                        (page === "reserves" ? s.reserve : s.primary)
                          .filter(
                            (id) => person(id) && searchMatches(person(id)!),
                          )
                          .map((id) => {
                            const a = s.attendance.find((a) =>
                              page === "reserves"
                                ? a.replacementId === id
                                : a.personId === id,
                            );
                            return (
                              <tr key={`${s.date}-${id}`}>
                                <td>{solarLabel(s.date)}</td>
                                <td>
                                  <span
                                    className={
                                      eventsFor(
                                        s.date,
                                        data.events,
                                        data.settings.hijriOffset,
                                      ).holiday
                                        ? "red-text"
                                        : ""
                                    }
                                  >
                                    {weekdays[dayOfWeek(s.date)]}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="person-cell"
                                    onClick={() => openProfile(id)}
                                  >
                                    <Avatar
                                      person={person(id)}
                                      index={data.people.findIndex(
                                        (p) => p.id === id,
                                      )}
                                      small
                                    />
                                    <strong>{name(id)}</strong>
                                  </button>
                                </td>
                                <td>
                                  {page === "reserves" ? (
                                    <Badge tone={a ? "blue" : "gray"}>
                                      {a ? "جایگزین شده" : "آماده‌باش"}
                                    </Badge>
                                  ) : a ? (
                                    <Badge
                                      tone={
                                        a.status === "present"
                                          ? "green"
                                          : a.status === "excused"
                                            ? "amber"
                                            : "red"
                                      }
                                    >
                                      {statusLabels[a.status]}
                                    </Badge>
                                  ) : (
                                    <Badge tone="gray">ثبت نشده</Badge>
                                  )}
                                </td>
                                <td>
                                  {a
                                    ? page === "reserves"
                                      ? name(a.personId)
                                      : a.replacementId
                                        ? name(a.replacementId)
                                        : "—"
                                    : "—"}
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      if (page === "attendance")
                                        startAttendance(s.date, id);
                                      else {
                                        setSelectedDate(s.date);
                                        setDetailOpen(true);
                                      }
                                    }}
                                  >
                                    {page === "attendance"
                                      ? a
                                        ? "ویرایش وضعیت"
                                        : "ثبت وضعیت"
                                      : "جزئیات روز"}
                                    <ChevronLeft size={14} />
                                  </button>
                                  {page === "reserves" && (
                                    <button
                                      className="text-button"
                                      onClick={() => startReserveEdit(s.date)}
                                      style={{ marginInlineStart: 16 }}
                                    >
                                      تغییر رزرو
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          }),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="برنامه‌ای برای این ماه ندارید"
                  text="از بخش برنامهٔ شیفت‌ها، برنامهٔ ماه را بسازید."
                  action={
                    <button
                      className="button button-primary"
                      onClick={() => {
                        setPage("schedule");
                        open("generate");
                      }}
                    >
                      ایجاد برنامه
                    </button>
                  }
                />
              )}
              {page === "reserves" && (
                <ReserveHistory
                  changes={(data.reserveChanges || []).filter((c) =>
                    dates.includes(c.date),
                  )}
                  name={name}
                />
              )}
            </section>
          )}

          {page === "swaps" && (
            <section className="panel">
              <div className="section-toolbar">
                <div>
                  <h2>تاریخچهٔ جابه‌جایی‌ها</h2>
                  <p>
                    سوابق پس از ثبت باقی می‌مانند و در خروجی اکسل هم قابل
                    دریافت‌اند.
                  </p>
                </div>
                <Badge tone="gray">
                  {fa(data.swaps.length + (data.reserveChanges?.length || 0))}{" "}
                  تغییر
                </Badge>
              </div>
              {data.swaps.length || data.reserveChanges?.length ? (
                <div className="swap-list">
                  {data.swaps.map((s) => (
                    <article className="swap-record" key={s.id}>
                      <span className="swap-record-icon">
                        <ArrowLeftRight size={21} />
                      </span>
                      <div>
                        <h3>
                          {name(s.firstId)} <ArrowLeftRight size={14} />{" "}
                          {name(s.secondId)}
                        </h3>
                        <p>
                          {solarLabel(s.firstDate)}
                          {s.firstDate !== s.secondDate
                            ? ` ↔ ${solarLabel(s.secondDate)}`
                            : " · تبادل نیروی اصلی و رزرو"}
                        </p>
                        {s.note && <p className="swap-note">{s.note}</p>}
                        <small>
                          ثبت در{" "}
                          {new Intl.DateTimeFormat("fa-IR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Tehran",
                          }).format(new Date(s.createdAt))}
                        </small>
                      </div>
                      <Badge>ثبت شده</Badge>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="همه‌چیز طبق برنامه است"
                  text="با ثبت اولین جابه‌جایی، نام دو نفر و تاریخ شیفت‌هایشان اینجا نمایش داده می‌شود."
                  action={
                    <button
                      className="button button-primary"
                      onClick={() => startSwap()}
                    >
                      <ArrowLeftRight size={17} />
                      ثبت جابه‌جایی
                    </button>
                  }
                />
              )}
              <ReserveHistory changes={data.reserveChanges || []} name={name} />
            </section>
          )}

          {page === "reports" && (
            <>
              <div className="stats-grid">
                <StatCard
                  label="اختلاف کل شیفت‌ها"
                  value={totalSpread}
                  unit="شیفت"
                  icon={<CalendarRange size={20} />}
                  foot="بین نیروهای اصلی فعال"
                />
                <StatCard
                  label="اختلاف شیفت تعطیل"
                  value={holidaySpread}
                  unit="شیفت"
                  icon={<ShieldCheck size={20} />}
                  foot="کمتر باشد، توزیع متعادل‌تر است"
                />
                <StatCard
                  label="حضور ثبت‌شده"
                  value={monthShifts.reduce(
                    (n, s) =>
                      n +
                      s.attendance.filter((a) => a.status === "present")
                        .length +
                      s.attendance.filter((a) => a.replacementId).length,
                    0,
                  )}
                  unit="نفر ـ روز"
                  icon={<UserRoundCheck size={20} />}
                  foot="حضور اصلی و جایگزینی ثبت‌شده"
                  tone="blue"
                />
                <StatCard
                  label="غیبت ثبت‌شده"
                  value={monthShifts.reduce(
                    (n, s) =>
                      n +
                      s.attendance.filter((a) => a.status !== "present").length,
                    0,
                  )}
                  unit="نفر ـ روز"
                  icon={<Clock3 size={20} />}
                  foot="شامل موجه و غیرموجه"
                  tone="amber"
                />
              </div>
              <section className="panel">
                <div className="section-toolbar">
                  {monthControls}
                  <Badge tone="gray">گزارش ماه انتخاب‌شده</Badge>
                </div>
                <Notice>
                  عدالت با تعداد کل، تعطیلات، جمعه‌ها و روزهای هفته سنجیده
                  می‌شود. اختلاف صفر یا یک معمولاً متعادل است؛ محدودیت استراحت و
                  تعداد نفرات می‌تواند اختلاف ایجاد کند. سابقهٔ ماه‌های
                  ذخیره‌شده و حضور جایگزین‌ها در برنامه‌ریزی آینده لحاظ می‌شود.
                </Notice>
                <Notice>
                  سابقهٔ پیش از این ماه: {fa(priorMonthCount)} ماه و{" "}
                  {fa(priorShifts.length)} روز برنامهٔ ذخیره‌شده. ستون‌های
                  «تعطیل قبلی» و «جمعه قبلی» بار کاری قبلی را با احتساب
                  جایگزین‌ها و کسر غیبت ثبت‌شده نشان می‌دهند. هر ماه نیز جداگانه
                  متعادل می‌شود تا یک نفر برای جبران سابقه، همهٔ تعطیلات ماه را
                  نگیرد.
                </Notice>
                <div className="table-scroll">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>پرسنل</th>
                        <th>تعطیل قبلی</th>
                        <th>جمعه قبلی</th>
                        <th>کل این ماه</th>
                        <th>عادی</th>
                        <th>تعطیل</th>
                        <th>رزرو</th>
                        {weekdays.map((w) => (
                          <th key={w}>{w}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthStats.map((p, i) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="person-cell"
                              onClick={() => openProfile(p.id)}
                            >
                              <Avatar person={p} index={i} small />
                              <strong>{p.name}</strong>
                            </button>
                          </td>
                          <td>
                            {fa(priorStats.get(p.id)?.workloadHoliday || 0)}
                          </td>
                          <td>
                            {fa(priorStats.get(p.id)?.workloadFriday || 0)}
                          </td>
                          <td>
                            <b>{fa(p.stats.total)}</b>
                          </td>
                          <td>{fa(p.stats.total - p.stats.holiday)}</td>
                          <td>
                            <span className="holiday-stat">
                              {fa(p.stats.holiday)}
                            </span>
                          </td>
                          <td>{fa(p.stats.reserve)}</td>
                          {p.stats.weekdays.map((n, j) => (
                            <td key={j}>
                              <span
                                className={`heat-cell heat-${Math.min(n, 3)}`}
                              >
                                {fa(n)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {page === "settings" && (
            <div className="settings-layout">
              <AppearancePanel
                value={appearance}
                onChange={(value) =>
                  commit(
                    { ...data, appearance: value },
                    "ظاهر برنامه ذخیره شد.",
                  )
                }
                notify={showToast}
              />
              <section className="panel settings-panel">
                <div className="settings-title">
                  <Settings2 size={21} />
                  <div>
                    <h2>قواعد برنامه‌ریزی</h2>
                    <p>تغییر این قواعد فقط در برنامه‌های جدید اعمال می‌شود.</p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      commit(
                        { ...data, settings },
                        "تنظیمات ذخیره شد. برنامه‌های موجود تغییر نکردند.",
                      )
                    )
                      setError("");
                  }}
                >
                  <div className="form-grid">
                    <Field label="تعداد نیروی اصلی در روز">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        required
                        value={settings.primaryCount}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            primaryCount: +e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="تعداد نیروی رزرو در روز">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        required
                        value={settings.reserveCount}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            reserveCount: +e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="حداقل روز استراحت بین دو شیفت"
                      hint="مثلاً ۱ یعنی بین دو شیفت حداقل یک روز فاصله باشد."
                    >
                      <input
                        type="number"
                        min="0"
                        max="14"
                        required
                        value={settings.minRestDays}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            minRestDays: +e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="اصلاح قمری برای سال‌های فاقد جدول"
                      hint="فقط خارج از بازهٔ جدول ایران اثر دارد؛ تاریخ‌های جدول با این گزینه جابه‌جا نمی‌شوند."
                    >
                      <Select
                        value={settings.hijriOffset}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            hijriOffset: +e.target.value,
                          })
                        }
                      >
                        {[-2, -1, 0, 1, 2].map((n) => (
                          <option key={n} value={n}>
                            {n === 0
                              ? "بدون تغییر"
                              : `${fa(Math.abs(n))} روز ${n > 0 ? "جلوتر" : "عقب‌تر"}`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Notice>
                    تقویم ایران تا پایان ۱۴۰۵ با جدول شروع ماه‌های قمری و
                    مناسبت‌های به‌روز همراه برنامه است. برای نمونه، شهادت حضرت
                    فاطمه در جمعه ۲۲ آبان ۱۴۰۵ قرار دارد. خارج از بازهٔ جدول،
                    تاریخ قمری برآوردی است. تعطیلی‌های موردی و اصلاحات سفارشی
                    شما همچنان اولویت دارند.
                  </Notice>
                  <button className="button button-primary" type="submit">
                    <Check size={17} />
                    ذخیرهٔ تنظیمات
                  </button>
                </form>
              </section>
              <section className="panel settings-panel">
                <div className="settings-title">
                  <HardDriveDownload size={21} />
                  <div>
                    <h2>پشتیبان‌گیری و بازیابی</h2>
                    <p>اطلاعات فقط در همین دستگاه نگهداری می‌شوند.</p>
                  </div>
                </div>
                <p className="body-text">
                  حذف فایل‌های داده یا تغییر دستگاه می‌تواند دسترسی به داده‌ها
                  را از بین ببرد. به‌صورت منظم پشتیبان بگیرید و فایل را در محل
                  امن نگه دارید. فایل پشتیبان شامل اطلاعات شخصی پرسنل است.
                </p>
                <div className="backup-actions">
                  <button className="button button-primary" onClick={backup}>
                    <ArrowDownToLine size={17} />
                    دریافت پشتیبان کامل
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => backupInput.current?.click()}
                  >
                    <FileUp size={17} />
                    بازیابی پشتیبان
                  </button>
                </div>
                <input
                  type="file"
                  hidden
                  accept=".json"
                  ref={backupInput}
                  onChange={(e) => handleRestore(e.target.files?.[0])}
                />
                <div className="privacy-box">
                  <ShieldCheck size={25} />
                  <div>
                    <b>حریم خصوصی، به انتخاب شما</b>
                    <p>
                      بدون حساب کاربری، بدون ارسال اطلاعات و بدون وابستگی به
                      سرویس خارجی.
                    </p>
                  </div>
                </div>
              </section>
              <section className="panel settings-panel events-settings">
                <div className="section-toolbar">
                  <div>
                    <h2>مناسبت‌ها و تعطیلی‌های سفارشی</h2>
                    <p>این تعطیلی‌ها در محاسبهٔ عدالت نیز لحاظ می‌شوند.</p>
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => startEvent(today)}
                  >
                    <Plus size={16} />
                    افزودن مناسبت
                  </button>
                </div>
                {data.events.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>تاریخ</th>
                          <th>عنوان</th>
                          <th>وضعیت</th>
                          <th>عملیات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.map((e, i) => (
                          <tr key={`${e.date}-${i}`}>
                            <td>{solarLabel(e.date)}</td>
                            <td>{e.title}</td>
                            <td>
                              <Badge tone={e.holiday ? "red" : "gray"}>
                                {e.holiday ? "تعطیل" : "مناسبت"}
                              </Badge>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="text-button"
                                  onClick={() => startEvent(e.date, i)}
                                >
                                  ویرایش
                                </button>
                                <button
                                  className="icon-button danger"
                                  aria-label={`حذف ${e.title}`}
                                  onClick={() =>
                                    commit(
                                      {
                                        ...data,
                                        events: data.events.filter(
                                          (_, j) => j !== i,
                                        ),
                                      },
                                      "مناسبت حذف شد.",
                                    )
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="aside-empty">
                    هنوز مناسبت سفارشی ثبت نکرده‌اید.
                  </p>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      {detailOpen && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailOpen(false);
          }}
        >
          <DayDrawer
            date={selectedDate}
            data={data}
            onClose={() => setDetailOpen(false)}
            name={name}
            profile={(id) => {
              setDetailOpen(false);
              openProfile(id);
            }}
            attendance={(date, id) => {
              setDetailOpen(false);
              startAttendance(date, id);
            }}
            swap={() => {
              setDetailOpen(false);
              startSwap(selectedDate);
            }}
            reserves={() => {
              setDetailOpen(false);
              startReserveEdit(selectedDate);
            }}
            event={() => {
              setDetailOpen(false);
              startEvent(selectedDate);
            }}
          />
        </div>
      )}

      {dialog === "reserve" && (
        <ReserveEditor
          data={data}
          initialDate={reserveEditDate}
          onSave={(next) =>
            commit(next, "رزروهای روز ذخیره شدند و تغییرات در تاریخچه ثبت شد.")
          }
          onClose={close}
        />
      )}
      {dialog === "generate" && (
        <Modal
          title="ایجاد برنامهٔ عادلانه"
          subtitle={`${months[month - 1]} ${fa(year)} · شیفت‌های روزانه`}
          onClose={close}
        >
          <div className="modal-body">
            <div className="generation-visual">
              <span className="generation-orbit">
                <WandSparkles size={34} />
              </span>
              <h3>یک برنامه، با در نظر گرفتن همه</h3>
              <p>
                تعداد شیفت‌ها، سهم تعطیلات، روزهای هفته و سابقهٔ قبلی بررسی
                می‌شوند.
              </p>
            </div>
            <div className="generation-facts">
              <div>
                <span>نیروی اصلی در روز</span>
                <b>{fa(data.settings.primaryCount)} نفر</b>
              </div>
              <div>
                <span>نیروی رزرو در روز</span>
                <b>{fa(data.settings.reserveCount)} نفر</b>
              </div>
              <div>
                <span>حداقل استراحت</span>
                <b>{fa(data.settings.minRestDays)} روز</b>
              </div>
              <div>
                <span>تعداد روزهای ماه</span>
                <b>{fa(dates.length)} روز</b>
              </div>
            </div>
            {monthShifts.length > 0 && (
              <Notice warning>
                برنامهٔ فعلی این ماه جایگزین می‌شود. ماه دارای سابقهٔ حضور، غیبت
                یا جابه‌جایی، برای حفظ سوابق بازتولید نمی‌شود.
              </Notice>
            )}
            <Notice>
              اگر نیروی کافی برای رعایت فاصلهٔ استراحت نباشد، برنامه با هشدار
              ساخته می‌شود. عدالت یک هدف بهینه‌سازی است و گزارش آن قابل بررسی
              است.
            </Notice>
            {error && <ErrorText text={error} />}
          </div>
          <div className="modal-footer">
            <button className="button button-primary" onClick={handleGenerate}>
              <WandSparkles size={17} />
              ساخت برنامهٔ {months[month - 1]}
            </button>
            <button className="button button-secondary" onClick={close}>
              انصراف
            </button>
          </div>
        </Modal>
      )}

      {dialog === "import" && (
        <Modal
          title="ورود پرسنل از اکسل"
          subtitle="فایل را انتخاب کنید، پیش‌نمایش را ببینید و سپس تأیید کنید."
          onClose={close}
          wide
        >
          <div className="modal-body">
            <input
              ref={importInput}
              type="file"
              hidden
              accept=".xlsx"
              onChange={(e) => handleExcel(e.target.files?.[0])}
            />
            <button
              className="upload-zone"
              onClick={() => importInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleExcel(e.dataTransfer.files[0]);
              }}
              disabled={busy}
            >
              <span>
                <FileSpreadsheet size={31} />
              </span>
              <strong>
                {busy
                  ? "در حال خواندن فایل…"
                  : fileName || "فایل اکسل را اینجا رها کنید"}
              </strong>
              <p>یا برای انتخاب فایل کلیک کنید</p>
              <small>فرمت XLSX · حداکثر ۵ مگابایت · تا ۲۰۰۰ نفر</small>
            </button>
            <div className="template-row">
              <span>برای ورود آسان‌تر، از الگوی آماده استفاده کنید.</span>
              <button
                className="text-button"
                onClick={() =>
                  downloadTemplate().catch(() =>
                    showToast("دریافت الگو انجام نشد."),
                  )
                }
              >
                <ArrowDownToLine size={15} />
                دریافت فایل الگو
              </button>
            </div>
            {data.demo && (
              <Notice>
                با ورود تیم شما، اسامی و شیفت‌های نمونه جایگزین می‌شوند. پس از
                ورود، برنامهٔ جدید بسازید.
              </Notice>
            )}
            {!data.demo && (
              <Notice>
                کد پرسنلی یا نام موجود به‌روزرسانی می‌شود؛ افراد جدید اضافه
                می‌شوند و سوابق قبلی باقی می‌مانند.
              </Notice>
            )}
            {error && <ErrorText text={error} />}
            {importErrors.length > 0 && (
              <div className="import-errors">
                <b>پیش از ورود، خطاهای فایل را اصلاح کنید:</b>
                {importErrors.slice(0, 8).map((e) => (
                  <p key={e}>{e}</p>
                ))}
                {importErrors.length > 8 && (
                  <p>و {fa(importErrors.length - 8)} خطای دیگر</p>
                )}
              </div>
            )}
            {imported.length > 0 && (
              <>
                <div className="preview-title">
                  <b>پیش‌نمایش پرسنل</b>
                  <Badge>{fa(imported.length)} نفر</Badge>
                </div>
                <div className="table-scroll import-preview">
                  <table>
                    <thead>
                      <tr>
                        <th>نام</th>
                        <th>کد</th>
                        <th>واحد</th>
                        <th>نوع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imported.slice(0, 20).map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.id.startsWith("name:") ? "—" : fa(p.id)}</td>
                          <td>{p.department || "—"}</td>
                          <td>{p.reserveOnly ? "فقط رزرو" : "اصلی و رزرو"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button button-primary"
              disabled={busy || !imported.length || importErrors.length > 0}
              onClick={applyImport}
            >
              <Check size={17} />
              تأیید ورود {imported.length > 0 && `${fa(imported.length)} نفر`}
            </button>
            <button className="button button-secondary" onClick={close}>
              انصراف
            </button>
          </div>
        </Modal>
      )}

      {dialog === "person" && (
        <Modal
          title="افزودن پرسنل"
          subtitle="اطلاعات عضو جدید تیم را وارد کنید."
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const id = personForm.id.trim(),
                pname = personForm.name.trim();
              if (!id || !pname) {
                setError("کد و نام نمی‌توانند خالی باشند.");
                return;
              }
              if (data.people.some((p) => p.id === id)) {
                setError("این کد پرسنلی قبلاً ثبت شده است.");
                return;
              }
              if (
                commit(
                  {
                    ...data,
                    people: [
                      ...data.people,
                      { ...personForm, id, name: pname, active: true },
                    ],
                  },
                  "پرسنل جدید اضافه شد.",
                )
              )
                close();
            }}
          >
            <div className="modal-body form-stack">
              <Field label="نام و نام خانوادگی">
                <input
                  required
                  maxLength={100}
                  value={personForm.name}
                  onChange={(e) =>
                    setPersonForm({ ...personForm, name: e.target.value })
                  }
                  placeholder="مثلاً سارا احمدی"
                />
              </Field>
              <div className="form-grid">
                <Field label="کد پرسنلی">
                  <input
                    required
                    maxLength={100}
                    value={personForm.id}
                    onChange={(e) =>
                      setPersonForm({ ...personForm, id: e.target.value })
                    }
                  />
                </Field>
                <Field label="واحد">
                  <input
                    maxLength={100}
                    value={personForm.department}
                    onChange={(e) =>
                      setPersonForm({
                        ...personForm,
                        department: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={personForm.reserveOnly}
                  onChange={(e) =>
                    setPersonForm({
                      ...personForm,
                      reserveOnly: e.target.checked,
                    })
                  }
                />
                این فرد فقط در فهرست رزرو قرار بگیرد
              </label>
              {error && <ErrorText text={error} />}
            </div>
            <div className="modal-footer">
              <button className="button button-primary" type="submit">
                <UserRoundPlus size={17} />
                افزودن پرسنل
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={close}
              >
                انصراف
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "swap" && (
        <Modal
          title="ثبت جابه‌جایی شیفت"
          subtitle="تبادل دو شیفت یا تعویض نیروی اصلی با رزرو همان روز."
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const result = applySwap(data, swapForm);
                if (commit(result, "جابه‌جایی با نام افراد و تاریخ ثبت شد."))
                  close();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="modal-body form-stack">
              <div className="swap-form-part">
                <span className="form-step">۱</span>
                <div className="form-grid">
                  <Field label="تاریخ شیفت اول">
                    <Select
                      required
                      value={swapForm.firstDate}
                      onChange={(e) =>
                        setSwapForm({
                          ...swapForm,
                          firstDate: e.target.value,
                          firstId: "",
                          secondId: "",
                        })
                      }
                    >
                      <option value="">انتخاب تاریخ</option>
                      {data.shifts.map((s) => (
                        <option key={s.date} value={s.date}>
                          {solarLabel(s.date)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="نیروی اصلی">
                    <Select
                      required
                      value={swapForm.firstId}
                      onChange={(e) =>
                        setSwapForm({ ...swapForm, firstId: e.target.value })
                      }
                    >
                      <option value="">انتخاب نفر اول</option>
                      {data.shifts
                        .find((s) => s.date === swapForm.firstDate)
                        ?.primary.map((id) => (
                          <option key={id} value={id}>
                            {name(id)}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="swap-connector">
                <ArrowLeftRight size={20} />
              </div>
              <div className="swap-form-part">
                <span className="form-step">۲</span>
                <div className="form-grid">
                  <Field label="تاریخ شیفت دوم">
                    <Select
                      required
                      value={swapForm.secondDate}
                      onChange={(e) =>
                        setSwapForm({
                          ...swapForm,
                          secondDate: e.target.value,
                          secondId: "",
                        })
                      }
                    >
                      <option value="">انتخاب تاریخ</option>
                      {data.shifts.map((s) => (
                        <option key={s.date} value={s.date}>
                          {solarLabel(s.date)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label={
                      swapForm.firstDate === swapForm.secondDate
                        ? "نیروی رزرو همین روز"
                        : "نیروی اصلی روز دوم"
                    }
                  >
                    <Select
                      required
                      value={swapForm.secondId}
                      onChange={(e) =>
                        setSwapForm({ ...swapForm, secondId: e.target.value })
                      }
                    >
                      <option value="">انتخاب نفر دوم</option>
                      {(swapForm.firstDate === swapForm.secondDate
                        ? data.shifts.find(
                            (s) => s.date === swapForm.secondDate,
                          )?.reserve
                        : data.shifts.find(
                            (s) => s.date === swapForm.secondDate,
                          )?.primary
                      )?.map((id) => (
                        <option key={id} value={id}>
                          {name(id)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <Field label="توضیح جابه‌جایی (اختیاری)">
                <textarea
                  maxLength={500}
                  rows={2}
                  value={swapForm.note}
                  onChange={(e) =>
                    setSwapForm({ ...swapForm, note: e.target.value })
                  }
                  placeholder="مثلاً با توافق هر دو نفر"
                />
              </Field>
              <Notice>
                تداخل با شیفت یا رزرو و حداقل فاصلهٔ استراحت بررسی می‌شود. شیفت
                دارای حضور یا غیبت ثبت‌شده قابل جابه‌جایی نیست.
              </Notice>
              {error && <ErrorText text={error} />}
            </div>
            <div className="modal-footer">
              <button className="button button-primary" type="submit">
                <ArrowLeftRight size={17} />
                ثبت جابه‌جایی
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={close}
              >
                انصراف
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "attendance" && (
        <Modal
          title="ثبت حضور و غیاب"
          subtitle={`${name(attendanceForm.personId)} · ${solarLabel(attendanceForm.date)}`}
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (attendanceForm.date > today) {
                setError("ثبت حضور یا غیبت برای روز آینده مجاز نیست.");
                return;
              }
              try {
                if (
                  commit(
                    recordAttendance(
                      data,
                      attendanceForm.date,
                      attendanceForm.personId,
                      attendanceForm.status,
                      attendanceForm.note,
                      attendanceForm.replacementId || undefined,
                      releaseReserveId || undefined,
                    ),
                    "وضعیت حضور و غیاب ذخیره شد.",
                  )
                )
                  close();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="modal-body form-stack">
              <div className="attendance-options">
                {(["present", "excused", "unexcused"] as const).map(
                  (status) => (
                    <label
                      key={status}
                      className={`attendance-option ${attendanceForm.status === status ? "attendance-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="attendance"
                        checked={attendanceForm.status === status}
                        onChange={() =>
                          setAttendanceForm({
                            ...attendanceForm,
                            status,
                            replacementId: "",
                          })
                        }
                      />
                      {status === "present" ? (
                        <CircleCheck size={21} />
                      ) : status === "excused" ? (
                        <Clock3 size={21} />
                      ) : (
                        <XCircle size={21} />
                      )}
                      <span>{statusLabels[status]}</span>
                    </label>
                  ),
                )}
              </div>
              {attendanceForm.status !== "present" && (
                <>
                  <Field
                    label="انتخاب جایگزین از پرسنل"
                    hint="می‌توانید رزروهای فعلی یا فرد دیگری از همهٔ پرسنل فعال را انتخاب کنید."
                  >
                    <Select
                      value={attendanceForm.replacementId}
                      onChange={(e) => {
                        setAttendanceForm({
                          ...attendanceForm,
                          replacementId: e.target.value,
                        });
                        setReleaseReserveId("");
                        setError("");
                      }}
                    >
                      <option value="">بدون جایگزین</option>
                      <optgroup label="رزروهای این روز">
                        {attendanceShift?.reserve.map((id) => (
                          <option
                            key={id}
                            value={id}
                            disabled={attendanceShift.attendance.some(
                              (a) =>
                                a.personId !== attendanceForm.personId &&
                                a.replacementId === id,
                            )}
                          >
                            {name(id)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="سایر پرسنل فعال">
                        {activePeople
                          .filter(
                            (p) =>
                              attendanceShift &&
                              !attendanceShift.primary.includes(p.id) &&
                              !attendanceShift.reserve.includes(p.id),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.department ? ` (${p.department})` : ""}
                            </option>
                          ))}
                      </optgroup>
                    </Select>
                  </Field>
                  {outsideReserve && (
                    <>
                      <Notice>
                        این فرد در رزروهای فعلی نیست. مشخص کنید جای کدام رزرو
                        قرار بگیرد؛ ویرایش رزرو و ثبت غیبت با هم ذخیره می‌شوند.
                        فرد دارای حضور جایگزین ثبت‌شده حذف نمی‌شود.
                      </Notice>
                      <Field label="جای کدام رزرو قرار بگیرد؟">
                        <Select
                          required
                          value={releaseReserveId}
                          onChange={(e) => setReleaseReserveId(e.target.value)}
                        >
                          <option value="">انتخاب رزرو قبلی</option>
                          {attendanceShift?.reserve.map((id) => (
                            <option
                              key={id}
                              value={id}
                              disabled={attendanceShift.attendance.some(
                                (a) => a.replacementId === id,
                              )}
                            >
                              {name(id)}
                              {attendanceShift.attendance.some(
                                (a) => a.replacementId === id,
                              )
                                ? " — حضور جایگزین ثبت‌شده"
                                : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}
                </>
              )}
              <Field label="توضیحات (اختیاری)">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={attendanceForm.note}
                  onChange={(e) =>
                    setAttendanceForm({
                      ...attendanceForm,
                      note: e.target.value,
                    })
                  }
                  placeholder="علت غیبت یا توضیح حضور..."
                />
              </Field>
              {error && <ErrorText text={error} />}
            </div>
            <div className="modal-footer">
              <button className="button button-primary" type="submit">
                <Check size={17} />
                ذخیرهٔ وضعیت
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={close}
              >
                انصراف
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "event" && (
        <Modal
          title={
            eventEditing !== null ? "ویرایش مناسبت" : "افزودن مناسبت یا تعطیلی"
          }
          subtitle="مناسبت به‌صورت آفلاین ذخیره و در برنامه‌ریزی لحاظ می‌شود."
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const date = parseSolarInput(eventForm.date),
                  title = eventForm.title.trim();
                if (!title) throw new Error("عنوان مناسبت را وارد کنید.");
                const event = {
                  date,
                  title,
                  holiday: eventForm.holiday,
                  override: eventForm.override,
                };
                const events =
                  eventEditing !== null
                    ? data.events.map((v, i) =>
                        i === eventEditing ? event : v,
                      )
                    : [...data.events, event];
                if (
                  commit(
                    { ...data, events },
                    "مناسبت ذخیره شد. برای اثرگذاری روی تخصیص، برنامهٔ بدون سابقه را دوباره بسازید.",
                  )
                )
                  close();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="modal-body form-stack">
              <Field label="تاریخ شمسی" hint="فرمت: سال/ماه/روز">
                <input
                  required
                  dir="ltr"
                  value={eventForm.date}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, date: e.target.value })
                  }
                  placeholder="1405/08/17"
                />
              </Field>
              <Field label="عنوان مناسبت">
                <input
                  required
                  maxLength={150}
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, title: e.target.value })
                  }
                />
              </Field>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={eventForm.holiday}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, holiday: e.target.checked })
                  }
                />
                این روز تعطیل است
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={eventForm.override}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, override: e.target.checked })
                  }
                />
                این وضعیت، جایگزین تعطیلی ثبت‌شدهٔ این روز شود
              </label>
              <p className="field-explanation">
                برای تعطیلی‌های موردی یا تغییر طبق اعلام رسمی، این گزینه را فعال
                کنید. با برداشتن تیک تعطیلی می‌توانید روز را برای برنامهٔ سازمان
                عادی کنید. این اصلاح شخصی بر تقویم همراه برنامه اولویت دارد.
              </p>
              {error && <ErrorText text={error} />}
            </div>
            <div className="modal-footer">
              <button className="button button-primary" type="submit">
                <Check size={17} />
                ذخیرهٔ مناسبت
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={close}
              >
                انصراف
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog === "profile" && profilePerson && (
        <Modal
          title="پروندهٔ پرسنل"
          subtitle="خلاصهٔ همهٔ ماه‌ها و سوابق ذخیره‌شده"
          onClose={close}
          wide
        >
          <Profile person={profilePerson} data={data} today={today} />
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="به هم‌شیفت خوش آمدید"
          subtitle="مدیریت شیفت، با خیال آسوده"
          onClose={close}
        >
          <div className="modal-body help-body">
            <div className="help-hero">
              <img className="help-logo" src={logo} alt="هم‌شیفت" />
              <strong>برنامهٔ بهتر، برای همه</strong>
              <p>تمام قابلیت‌ها و فونت‌ها در نسخهٔ آفلاین همراه برنامه‌اند.</p>
            </div>
            {[
              [
                "۱",
                "تیم خود را وارد کنید",
                "فایل اکسل با ستون‌های نام و نام خانوادگی، کد پرسنلی و واحد انتخاب کنید. فایل الگو در بخش ورود اکسل آماده است.",
              ],
              [
                "۲",
                "برنامهٔ ماه را بسازید",
                "ماه دلخواه را انتخاب کنید و «ایجاد برنامهٔ عادلانه» را بزنید. پیش‌فرض، روزانه دو نفر اصلی و دو نفر رزرو است.",
              ],
              [
                "۳",
                "حضور و تغییرات را ثبت کنید",
                "روی هر روز کلیک کنید؛ غیبت، نیروی جایگزین و جابه‌جایی‌ها را با حفظ سابقه ثبت کنید.",
              ],
              [
                "۴",
                "پشتیبان بگیرید",
                "داده‌ها فقط در همین دستگاه نگهداری می‌شوند. با دریافت فایل پشتیبان می‌توانید آن‌ها را به دستگاه دیگری منتقل کنید.",
              ],
            ].map(([n, title, text]) => (
              <div className="help-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
            <Notice>
              نسخهٔ نصب‌شدهٔ ویندوز با آیکون هم‌شیفت در دسکتاپ اجرا می‌شود و به
              مرورگر یا اینترنت نیاز ندارد. ورود و خروج اکسل، تقویم، برنامه‌ریزی
              و پشتیبان‌گیری به اینترنت نیاز ندارند.
            </Notice>
          </div>
          <div className="modal-footer">
            <button className="button button-primary" onClick={close}>
              متوجه شدم
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "alerts" && (
        <Modal
          title="وضعیت برنامه"
          subtitle="یادآوری‌های فضای کاری شما"
          onClose={close}
        >
          <div className="modal-body form-stack">
            <Notice>
              برنامه کاملاً محلی است. برای حفظ سوابق، به‌صورت منظم نسخهٔ پشتیبان
              دریافت کنید.
            </Notice>
            {generateResult.length ? (
              <Notice warning>
                {fa(generateResult.length)} محدودیت استراحت در آخرین برنامه
                رعایت نشده است. تعداد نیرو یا فاصلهٔ استراحت را بررسی کنید.
              </Notice>
            ) : (
              <CheckLine>
                هشدار تازه‌ای از آخرین برنامه‌ریزی وجود ندارد.
              </CheckLine>
            )}
            {data.demo && (
              <Notice>
                هنوز از اطلاعات نمونه استفاده می‌کنید. فایل اسامی واقعی را وارد
                کنید.
              </Notice>
            )}
            <Notice>
              جدول قمری ایران تا پایان ۱۴۰۵ همراه برنامه است. تاریخ‌های خارج از
              بازهٔ جدول با نشان برآوردی نمایش داده می‌شوند. تعطیلی‌های موردی
              طبق اعلام رسمی قابل ثبت‌اند.
            </Notice>
          </div>
          <div className="modal-footer">
            <button
              className="button button-primary"
              onClick={() => {
                close();
                backup();
              }}
            >
              دریافت پشتیبان
              <ArrowDownToLine size={16} />
            </button>
            <button className="button button-secondary" onClick={close}>
              بستن
            </button>
          </div>
        </Modal>
      )}
      {restoreCandidate && (
        <Modal
          title="بازیابی نسخهٔ پشتیبان"
          subtitle="این کار تمام داده‌های فعلی را جایگزین می‌کند."
          onClose={() => setRestoreCandidate(null)}
        >
          <div className="modal-body form-stack">
            <Notice warning>
              فایل شامل {fa(restoreCandidate.people.length)} نفر،{" "}
              {fa(restoreCandidate.shifts.length)} روز برنامه و{" "}
              {fa(restoreCandidate.swaps.length)} جابه‌جایی است. پیش از بازیابی،
              از اطلاعات فعلی پشتیبان بگیرید.
            </Notice>
            <button className="button button-secondary" onClick={backup}>
              دریافت پشتیبان از اطلاعات فعلی
            </button>
          </div>
          <div className="modal-footer">
            <button
              className="button button-primary"
              onClick={() => {
                if (
                  commit(restoreCandidate, "نسخهٔ پشتیبان بازیابی شد.", true)
                ) {
                  setSettings(restoreCandidate.settings);
                  setRestoreCandidate(null);
                }
              }}
            >
              تأیید جایگزینی و بازیابی
            </button>
            <button
              className="button button-secondary"
              onClick={() => setRestoreCandidate(null)}
            >
              انصراف
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button aria-label="بستن پیام" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <div className="error-text" role="alert">
      <XCircle size={17} />
      {text}
    </div>
  );
}
function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="پاک کردن جست‌وجو">
          <X size={14} />
        </button>
      )}
    </label>
  );
}
function ShiftTable({
  shifts,
  name,
  events,
  onSelect,
}: {
  shifts: AppData["shifts"];
  name: (id: string) => string;
  events: (date: string) => boolean;
  onSelect: (date: string) => void;
}) {
  return shifts.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>تاریخ</th>
            <th>روز</th>
            <th>نیروی اصلی</th>
            <th>نیروی رزرو</th>
            <th>جزئیات</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.date}>
              <td>{solarLabel(s.date)}</td>
              <td className={events(s.date) ? "red-text" : ""}>
                {weekdays[dayOfWeek(s.date)]}
              </td>
              <td>{s.primary.map(name).join("، ")}</td>
              <td>{s.reserve.map(name).join("، ")}</td>
              <td>
                <button
                  className="text-button"
                  onClick={() => onSelect(s.date)}
                >
                  مشاهده
                  <ChevronLeft size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="هنوز برنامه‌ای وجود ندارد"
      text="برای ماه انتخاب‌شده برنامه بسازید."
    />
  );
}
function DayDrawer({
  date,
  data,
  onClose,
  name,
  profile,
  attendance,
  swap,
  reserves,
  event,
}: {
  date: string;
  data: AppData;
  onClose: () => void;
  name: (id: string) => string;
  profile: (id: string) => void;
  attendance: (date: string, id: string) => void;
  swap: () => void;
  reserves: () => void;
  event: () => void;
}) {
  const shift = data.shifts.find((s) => s.date === date),
    info = eventsFor(date, data.events, data.settings.hijriOffset);
  return (
    <Modal
      title={solarLabel(date, true)}
      subtitle="جزئیات برنامهٔ روز"
      onClose={onClose}
    >
      <div className="modal-body form-stack">
        <div className="three-dates">
          <span>
            <small>شمسی</small>
            <b>{fa(solarInput(date))}</b>
          </span>
          <span>
            <small>میلادی</small>
            <b dir="ltr">{gregorianLabel(date)}</b>
          </span>
          <span>
            <small>
              {hasIranCalendar(date) ? "قمری ایران" : "قمری برآوردی"}
            </small>
            <b>{lunarLabel(date, data.settings.hijriOffset)}</b>
          </span>
        </div>
        {info.holiday && (
          <Badge tone="red">روز تعطیل{info.friday ? " · جمعه" : ""}</Badge>
        )}
        {info.events.map((e, i) => (
          <div className="day-event" key={i}>
            <CalendarDays size={16} />
            <span>{e.title}</span>
            {e.source === "lunar" && (
              <small>
                {hasIranCalendar(date) ? "قمری ایران" : "قمری برآوردی"}
              </small>
            )}
          </div>
        ))}
        {shift ? (
          <>
            <h3 className="small-title">
              <span className="little-dot green" />
              نیروهای اصلی{" "}
              <Badge tone="gray">{fa(shift.primary.length)} نفر</Badge>
            </h3>
            {shift.primary.map((id) => {
              const p = data.people.find((p) => p.id === id),
                a = shift.attendance.find((a) => a.personId === id);
              return (
                <div className="day-person" key={id}>
                  <button className="person-cell" onClick={() => profile(id)}>
                    <Avatar
                      person={p}
                      index={data.people.findIndex((p) => p.id === id)}
                    />
                    <span>
                      <strong>{name(id)}</strong>
                      <small>
                        {a ? statusLabels[a.status] : "وضعیت ثبت نشده"}
                      </small>
                    </span>
                  </button>
                  <button
                    className="button button-small button-secondary"
                    onClick={() => attendance(date, id)}
                  >
                    ثبت وضعیت
                  </button>
                  {a?.replacementId && (
                    <small className="replacement-line">
                      <ArrowLeftRight size={13} />
                      جایگزین: {name(a.replacementId)}
                    </small>
                  )}
                </div>
              );
            })}
            <div className="reserve-day-heading">
              <h3 className="small-title">
                <span className="little-dot gray" />
                نیروهای رزرو{" "}
                <Badge tone="gray">{fa(shift.reserve.length)} نفر</Badge>
              </h3>
              <button className="text-button" onClick={reserves}>
                <ShieldCheck size={15} />
                ویرایش رزروهای روز
              </button>
            </div>
            {shift.reserve.map((id) => (
              <div className="day-person" key={id}>
                <button className="person-cell" onClick={() => profile(id)}>
                  <Avatar
                    person={data.people.find((p) => p.id === id)}
                    index={data.people.findIndex((p) => p.id === id)}
                  />
                  <span>
                    <strong>{name(id)}</strong>
                    <small>
                      {shift.attendance.some((a) => a.replacementId === id)
                        ? "جایگزین شده"
                        : "آماده‌باش"}
                    </small>
                  </span>
                </button>
                <Badge tone="gray">رزرو</Badge>
              </div>
            ))}
            <div className="reserve-history-in-day">
              <ReserveHistory
                changes={(data.reserveChanges || []).filter(
                  (c) => c.date === date,
                )}
                name={name}
              />
            </div>
            {data.swaps
              .filter((s) => s.firstDate === date || s.secondDate === date)
              .map((s) => (
                <Notice key={s.id}>
                  جابه‌جایی {name(s.firstId)} با {name(s.secondId)} ثبت شده است.
                </Notice>
              ))}
          </>
        ) : (
          <Empty
            title="این روز برنامه ندارد"
            text="برای تخصیص نیروهای اصلی و رزرو، برنامهٔ این ماه را بسازید."
          />
        )}
      </div>
      <div className="modal-footer">
        {shift && (
          <button className="button button-primary" onClick={swap}>
            <ArrowLeftRight size={17} />
            جابه‌جایی نفرات
          </button>
        )}
        <button className="button button-secondary" onClick={event}>
          <Plus size={16} />
          ثبت مناسبت
        </button>
      </div>
    </Modal>
  );
}
function Profile({
  person,
  data,
  today,
}: {
  person: Person;
  data: AppData;
  today: string;
}) {
  const stats = personStats(person.id, data.shifts, data);
  const replacements = data.shifts.filter((s) =>
    s.attendance.some((a) => a.replacementId === person.id),
  );
  const next = data.shifts
    .filter((s) => s.date >= today && s.primary.includes(person.id))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const records = data.shifts
    .filter(
      (s) =>
        s.primary.includes(person.id) ||
        s.attendance.some((a) => a.replacementId === person.id),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="modal-body">
      <div className="profile-hero">
        <Avatar
          person={person}
          index={data.people.findIndex((p) => p.id === person.id)}
        />
        <div>
          <h3>{person.name}</h3>
          <p>
            {person.department || "بدون واحد"} · کد{" "}
            {fa(person.id.startsWith("name:") ? "—" : person.id)}
          </p>
        </div>
        <Badge tone={person.active ? "green" : "gray"}>
          {person.active ? "فعال" : "غیرفعال"}
        </Badge>
      </div>
      <div className="profile-stats">
        {[
          [stats.total, "شیفت برنامه‌ریزی‌شده"],
          [stats.present + replacements.length, "حضور و جایگزینی ثبت‌شده"],
          [stats.excused, "غیبت موجه"],
          [stats.unexcused, "غیبت غیرموجه"],
        ].map(([n, label]) => (
          <div key={label}>
            <b>{fa(n)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="next-shift">
        <Clock3 size={23} />
        <div>
          <strong>شیفت بعدی</strong>
          <p>
            {next ? solarLabel(next.date, true) : "شیفت آینده‌ای ثبت نشده است."}
          </p>
        </div>
        {next && (
          <b>
            {dayDistance(next.date, today) === 0
              ? "امروز"
              : `${fa(dayDistance(next.date, today))} روز دیگر`}
          </b>
        )}
      </div>
      <h3 className="small-title">سوابق شیفت‌ها</h3>
      <div className="table-scroll profile-history">
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>نوع روز</th>
              <th>وضعیت</th>
              <th>توضیحات</th>
            </tr>
          </thead>
          <tbody>
            {records.map((s) => {
              const a = s.attendance.find((a) => a.personId === person.id),
                replacement = s.attendance.find(
                  (a) => a.replacementId === person.id,
                );
              return (
                <tr key={s.date}>
                  <td>{solarLabel(s.date)}</td>
                  <td>
                    {eventsFor(s.date, data.events, data.settings.hijriOffset)
                      .holiday
                      ? "تعطیل"
                      : "عادی"}
                  </td>
                  <td>
                    {replacement ? (
                      <Badge tone="blue">حضور جایگزین</Badge>
                    ) : a ? (
                      <Badge
                        tone={
                          a.status === "present"
                            ? "green"
                            : a.status === "excused"
                              ? "amber"
                              : "red"
                        }
                      >
                        {statusLabels[a.status]}
                      </Badge>
                    ) : (
                      <Badge tone="gray">ثبت نشده</Badge>
                    )}
                  </td>
                  <td>
                    {a?.note ||
                      (replacement
                        ? `جایگزین ${data.people.find((p) => p.id === replacement.personId)?.name || ""}`
                        : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!records.length && (
          <p className="aside-empty">هنوز سابقه‌ای ثبت نشده است.</p>
        )}
      </div>
    </div>
  );
}

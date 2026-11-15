import ExcelJS from "exceljs";
import type { AppData, Person } from "../types";
import {
  fa,
  latin,
  solarInput,
  weekdays,
  dayOfWeek,
  eventsFor,
  todayKey,
  solarLabel,
} from "./calendar";
import { personStats } from "./scheduler";
import { historyShifts, scheduleLists, listShifts } from "./schedules";
import { reportRows, reportStatuses, type ReportFilters } from "./reports";

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function writeWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    name: "Tahoma",
    size: 11,
  };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF137C66" },
  };
  sheet.getRow(1).height = 28;
  sheet.columns.forEach((c) => {
    c.width = 24;
  });
}
export async function downloadTemplate() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("پرسنل");
  sheet.addRows([
    ["کد پرسنلی", "نام و نام خانوادگی", "واحد", "فقط رزرو"],
    ["1001", "سارا احمدی", "عملیات", "خیر"],
    ["1002", "عسل رضایی", "پشتیبانی", "خیر"],
  ]);
  styleSheet(sheet);
  await writeWorkbook(wb, "الگوی-ورود-پرسنل.xlsx");
}
const normalized = (v: string) =>
  latin(v)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s‌_-]/g, "")
    .toLowerCase();
export async function readPeople(
  file: File,
): Promise<{ people: Person[]; errors: string[] }> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "فایل باید با فرمت xlsx باشد. فایل قدیمی xls را در اکسل با فرمت xlsx ذخیره کنید.",
    );
  if (file.size > 5 * 1024 * 1024)
    throw new Error("حجم فایل نباید بیشتر از ۵ مگابایت باشد.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error(
      "فایل اکسل قابل خواندن نیست. فایل سالم و بدون رمز انتخاب کنید.",
    );
  }
  const sheet = wb.worksheets[0];
  if (!sheet || sheet.rowCount < 2)
    throw new Error("فایل باید سطر عنوان و حداقل یک نفر داشته باشد.");
  if (sheet.rowCount > 2001)
    throw new Error("حداکثر ۲۰۰۰ نفر در هر فایل قابل ورود است.");
  const cellText = (row: number, col: number) =>
    sheet.getRow(row).getCell(col).text.trim();
  const headers = Array.from(
    { length: Math.min(sheet.columnCount, 100) },
    (_, i) => normalized(cellText(1, i + 1)),
  );
  const find = (labels: string[]) =>
    headers.findIndex((h) => labels.map(normalized).includes(h)) + 1;
  const idCol = find(["کد پرسنلی", "کد", "id", "personnel id"]);
  const nameCol = find(["نام و نام خانوادگی", "نام کامل", "full name"]);
  const firstCol = find(["نام", "نام کوچک", "name", "first name"]);
  const lastCol = find(["نام خانوادگی", "last name"]);
  const deptCol = find(["واحد", "بخش", "department"]);
  const reserveCol = find(["فقط رزرو", "reserve only"]);
  if (!nameCol && !firstCol)
    throw new Error(
      "ستون «نام و نام خانوادگی» یافت نشد. از فایل الگو استفاده کنید.",
    );
  const people: Person[] = [],
    errors: string[] = [];
  const ids = new Set<string>(),
    names = new Set<string>();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const name = nameCol
      ? cellText(row, nameCol)
      : `${cellText(row, firstCol)} ${lastCol ? cellText(row, lastCol) : ""}`.trim();
    const rawId = idCol ? latin(cellText(row, idCol)) : "";
    if (!name && !rawId) continue;
    if (!name) {
      errors.push(`سطر ${fa(row)}: نام وارد نشده است.`);
      continue;
    }
    const nameKey = normalized(name);
    const id = rawId || `name:${nameKey}`;
    if (ids.has(id) || (!rawId && names.has(nameKey))) {
      errors.push(
        `سطر ${fa(row)}: کد تکراری یا نام همسان بدون کد یکتا «${name}».`,
      );
      continue;
    }
    if (name.length > 100 || id.length > 100) {
      errors.push(`سطر ${fa(row)}: نام یا کد بیش از حد طولانی است.`);
      continue;
    }
    ids.add(id);
    names.add(nameKey);
    people.push({
      id,
      name,
      department: deptCol ? cellText(row, deptCol).slice(0, 100) : "",
      active: true,
      reserveOnly:
        !!reserveCol &&
        ["بله", "yes", "true", "1"].includes(
          normalized(cellText(row, reserveCol)),
        ),
    });
  }
  if (!people.length && !errors.length)
    throw new Error("هیچ نامی در فایل پیدا نشد.");
  return { people, errors };
}
export function buildScheduleWorkbook(data: AppData, dates: string[]) {
  if (!dates.length) throw new Error("بازهٔ خروجی خالی است.");
  const wb = new ExcelJS.Workbook();
  wb.creator = "هم‌شیفت";
  wb.created = new Date();
  const name = (id: string) => data.people.find((p) => p.id === id)?.name || id;
  const schedule = wb.addWorksheet("برنامه شیفت");
  schedule.addRow([
    "تاریخ شمسی",
    "تاریخ میلادی",
    "روز",
    "نوع روز",
    "نیروی اصلی",
    "رزرو",
    "مناسبت",
    "حضور و غیاب",
  ]);
  for (const date of dates) {
    const s = data.shifts.find((s) => s.date === date),
      e = eventsFor(date, data.events, data.settings.hijriOffset);
    schedule.addRow([
      solarInput(date),
      date,
      weekdays[dayOfWeek(date)],
      e.holiday ? "تعطیل" : "عادی",
      s?.primary.map(name).join("، ") || "",
      s?.reserve.map(name).join("، ") || "",
      e.events.map((e) => e.title).join("، "),
      s?.attendance
        .map(
          (a) =>
            `${name(a.personId)}: ${a.status === "present" ? "حاضر" : a.status === "excused" ? "غیبت موجه" : "غیبت غیرموجه"}${a.replacementId ? `؛ جایگزین: ${name(a.replacementId)}` : ""}`,
        )
        .join(" | ") || "",
    ]);
  }
  const listByDate = new Map(
    scheduleLists(data).flatMap((l) =>
      listShifts(data, l).map((s) => [s.date, l] as const),
    ),
  );
  schedule.getRow(1).getCell(9).value = "فهرست برنامه";
  schedule.getRow(1).getCell(10).value = "محل خدمت";
  dates.forEach((date, i) => {
    schedule.getRow(i + 2).getCell(9).value = listByDate.get(date)?.name || "";
    schedule.getRow(i + 2).getCell(10).value =
      listByDate.get(date)?.location || "";
  });
  professionalSheet(
    schedule,
    "برنامهٔ شیفت پرسنل",
    `${solarLabel(dates[0])} تا ${solarLabel(dates.at(-1)!)}`,
    `${fa(dates.length)} روز · ${fa(data.people.length)} نفر`,
    [18, 16, 16, 14, 34, 34, 46, 56, 30, 24],
    dates.map(
      (date) => eventsFor(date, data.events, data.settings.hijriOffset).holiday,
    ),
  );
  const report = wb.addWorksheet("گزارش عدالت");
  report.addRow([
    "کد",
    "نام",
    "کل شیفت",
    "شیفت تعطیل",
    "جمعه",
    "رزرو",
    "حاضر",
    "غیبت موجه",
    "غیبت غیرموجه",
    "حضور جایگزین",
    "شیفت تعطیل پیش از این ماه",
    "جمعه پیش از این ماه",
  ]);
  for (const p of data.people) {
    const s = personStats(
      p.id,
      data.shifts.filter((s) => dates.includes(s.date)),
      data,
    );
    const prior = personStats(
      p.id,
      historyShifts(data).filter((s) => s.date < dates[0]),
      data,
    );
    report.addRow([
      p.id.startsWith("name:") ? "" : p.id,
      p.name,
      s.total,
      s.holiday,
      s.friday,
      s.reserve,
      s.present,
      s.excused,
      s.unexcused,
      s.replacements,
      prior.workloadHoliday,
      prior.workloadFriday,
    ]);
  }
  professionalSheet(
    report,
    "گزارش عدالت و سهم شیفت‌ها",
    `${solarLabel(dates[0])} تا ${solarLabel(dates.at(-1)!)}`,
    "سوابق قبلی شامل حق شیفت‌های محفوظ در بایگانی است",
    [18, 28, 16, 16, 16, 16, 16, 18, 18, 18, 22, 22],
  );
  if (report.rowCount > 5)
    report.addConditionalFormatting({
      ref: `C6:F${report.rowCount}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "max" }],
          color: [{ argb: "FFE8F4F2" }, { argb: "FF65B7A6" }],
        },
      ],
    });
  const swaps = wb.addWorksheet("جابه‌جایی‌ها");
  swaps.addRow([
    "نوع تغییر",
    "نفر اول",
    "تاریخ اول",
    "نفر دوم",
    "تاریخ دوم",
    "توضیح",
    "زمان ثبت",
  ]);
  for (const s of data.swaps.filter(
    (s) => dates.includes(s.firstDate) || dates.includes(s.secondDate),
  ))
    swaps.addRow([
      "جابه‌جایی شیفت",
      name(s.firstId),
      solarInput(s.firstDate),
      name(s.secondId),
      solarInput(s.secondDate),
      s.note,
      s.createdAt,
    ]);
  for (const change of (data.reserveChanges || []).filter((c) =>
    dates.includes(c.date),
  )) {
    swaps.addRow([
      "تغییر رزرو",
      change.previousIds.map(name).join("، "),
      solarInput(change.date),
      change.nextIds.map(name).join("، "),
      solarInput(change.date),
      change.note,
      change.createdAt,
    ]);
  }
  professionalSheet(
    swaps,
    "تاریخچهٔ جابه‌جایی و تغییر رزرو",
    `${solarLabel(dates[0])} تا ${solarLabel(dates.at(-1)!)}`,
    `${fa(swaps.rowCount - 1)} تغییر ثبت‌شده`,
    [24, 34, 18, 34, 18, 50, 28],
  );
  return wb;
}
export async function exportSchedule(data: AppData, dates: string[]) {
  await writeWorkbook(
    buildScheduleWorkbook(data, dates),
    `برنامه-شیفت-${solarInput(dates[0]).slice(0, 7).replace("/", "-")}.xlsx`,
  );
}

function professionalSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  range: string,
  summary: string,
  widths: number[],
  holidays: boolean[] = [],
) {
  const columns = widths.length;
  sheet.spliceRows(
    1,
    0,
    [title],
    [`بازه: ${range}  |  تهیه‌شده: ${solarLabel(todayKey())}`],
    [summary],
    [],
  );
  for (let row = 1; row <= 3; row++) sheet.mergeCells(row, 1, row, columns);
  sheet.getRow(1).height = 40;
  sheet.getRow(2).height = 28;
  sheet.getRow(3).height = 26;
  for (const row of [1, 2, 3]) {
    sheet.getRow(row).font = {
      name: "Tahoma",
      size: row === 1 ? 18 : 11,
      bold: row !== 2,
      color: { argb: row === 1 ? "FFFFFFFF" : "FF244C55" },
    };
    sheet.getRow(row).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: row === 1 ? "FF153F4A" : "FFE8F3F2" },
    };
    sheet.getRow(row).alignment = {
      horizontal: "right",
      vertical: "middle",
      wrapText: true,
      readingOrder: "rtl",
    };
  }
  sheet.getRow(5).height = 34;
  sheet.getRow(5).font = {
    name: "Tahoma",
    size: 11,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getRow(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF147E68" },
  };
  sheet.getRow(5).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  widths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  for (let row = 6; row <= sheet.rowCount; row++) {
    const r = sheet.getRow(row);
    r.height = 42;
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Tahoma", size: 11, color: { argb: "FF233F47" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: "right",
        wrapText: true,
        readingOrder: "rtl",
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: holidays[row - 6]
            ? "FFFFF0DD"
            : row % 2
              ? "FFF0F6F8"
              : "FFFFFFFF",
        },
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD7E5E6" } } };
    });
  }
  sheet.views = [
    { rightToLeft: true, state: "frozen", ySplit: 5, showGridLines: false },
  ];
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5, sheet.rowCount), column: columns },
  };
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:5",
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.15,
      footer: 0.2,
    },
  };
  sheet.headerFooter = { oddFooter: "&Rهم‌شیفت — گزارش پرسنل&Cصفحه &P از &N" };
}

export function buildReportWorkbook(data: AppData, filters: ReportFilters) {
  const rows = reportRows(data, filters),
    wb = new ExcelJS.Workbook();
  wb.creator = "هم‌شیفت";
  wb.created = new Date();
  const sheet = wb.addWorksheet("گزارش فیلترشده");
  sheet.addRow([
    "تاریخ شمسی",
    "تاریخ میلادی",
    "روز هفته",
    "نوع روز",
    "کد پرسنلی",
    "نام و نام خانوادگی",
    "واحد",
    "محل خدمت",
    "فهرست برنامه",
    "نقش",
    "وضعیت",
    "توضیحات",
    "منبع",
  ]);
  for (const row of rows)
    sheet.addRow([
      solarInput(row.date),
      row.date,
      weekdays[dayOfWeek(row.date)],
      row.holiday ? "تعطیل" : "عادی",
      row.personId,
      row.name,
      row.department,
      row.location,
      row.schedule,
      row.role,
      reportStatuses[row.status],
      row.note,
      row.archived ? "حق شیفت بایگانی‌شده" : "برنامهٔ فعال",
    ]);
  professionalSheet(
    sheet,
    "گزارش کارکرد و وضعیت شیفت‌ها",
    `${solarLabel(filters.start)} تا ${solarLabel(filters.end)}`,
    `واحد: ${filters.department || "همه"} · وضعیت: ${reportStatuses[filters.status as keyof typeof reportStatuses] || "همهٔ افراد دارای نقش"} · ${fa(rows.length)} ردیف · ${fa(new Set(rows.map((r) => r.personId)).size)} نفر`,
    [18, 16, 16, 14, 18, 30, 22, 24, 30, 16, 24, 44, 26],
    rows.map((r) => r.holiday),
  );
  const summary = wb.addWorksheet("خلاصهٔ واحدها");
  summary.addRow([
    "واحد",
    "اصلی",
    "رزرو",
    "حاضر",
    "جایگزین",
    "غایب",
    "حضور ثبت نشده",
    "بدون شیفت",
  ]);
  for (const department of [...new Set(rows.map((r) => r.department))]) {
    const selected = rows.filter((r) => r.department === department);
    summary.addRow([
      department || "بدون واحد",
      ...[
        (r: (typeof rows)[number]) => r.role === "اصلی",
        (r: (typeof rows)[number]) => r.role === "رزرو",
        (r: (typeof rows)[number]) => r.status === "present",
        (r: (typeof rows)[number]) => r.status === "replacement",
        (r: (typeof rows)[number]) =>
          r.status === "excused" || r.status === "unexcused",
        (r: (typeof rows)[number]) => r.status === "unrecorded",
        (r: (typeof rows)[number]) => r.status === "off",
      ].map((predicate) => selected.filter(predicate).length),
    ]);
  }
  professionalSheet(
    summary,
    "خلاصهٔ گزارش بر اساس واحد",
    `${solarLabel(filters.start)} تا ${solarLabel(filters.end)}`,
    "اعداد بر حسب نفر ـ روز و بر اساس همین فیلترها هستند؛ حضور ثبت‌نشده به معنی غیبت نیست.",
    [30, 18, 18, 18, 18, 18, 22, 18],
  );
  const parameters = wb.addWorksheet("فیلترهای گزارش");
  parameters.addRows([
    ["پارامتر", "انتخاب کاربر"],
    ["از تاریخ", solarLabel(filters.start)],
    ["تا تاریخ", solarLabel(filters.end)],
    ["واحد", filters.department || "همهٔ واحدها"],
    [
      "پرسنل",
      data.people.find((p) => p.id === filters.personId)?.name ||
        filters.personId ||
        "همهٔ پرسنل",
    ],
    [
      "فهرست برنامه",
      [
        ...scheduleLists(data),
        ...(data.archives || []).map((a) => a.schedule),
      ].find((s) => s.id === filters.scheduleId)?.name || "همهٔ فهرست‌ها",
    ],
    ["محل خدمت", filters.location || "همهٔ موقعیت‌ها"],
    [
      "وضعیت",
      reportStatuses[filters.status as keyof typeof reportStatuses] ||
        "همهٔ افراد دارای نقش",
    ],
    [
      "نوع روز",
      (
        { normal: "عادی", holiday: "تعطیل", friday: "جمعه" } as Record<
          string,
          string
        >
      )[filters.dayType] || "همهٔ روزها",
    ],
    ["شامل حق شیفت بایگانی", filters.includeArchive ? "بله" : "خیر"],
    ["تعداد ردیف نتیجه", rows.length],
  ]);
  professionalSheet(
    parameters,
    "مشخصات و فیلترهای گزارش",
    `${solarLabel(filters.start)} تا ${solarLabel(filters.end)}`,
    "این فیلترها عیناً بر ردیف‌های گزارش و خلاصهٔ واحدها اعمال شده‌اند.",
    [32, 84],
  );
  return wb;
}
export async function exportReport(data: AppData, filters: ReportFilters) {
  await writeWorkbook(
    buildReportWorkbook(data, filters),
    `گزارش-شیفت-${solarInput(filters.start).replaceAll("/", "-")}-${solarInput(filters.end).replaceAll("/", "-")}.xlsx`,
  );
}

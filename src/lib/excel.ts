import ExcelJS from "exceljs";
import type { AppData, Person } from "../types";
import {
  fa,
  latin,
  solarInput,
  weekdays,
  dayOfWeek,
  eventsFor,
} from "./calendar";
import { personStats } from "./scheduler";

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
export async function exportSchedule(data: AppData, dates: string[]) {
  const wb = new ExcelJS.Workbook();
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
  styleSheet(schedule);
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
  ]);
  for (const p of data.people) {
    const s = personStats(
      p.id,
      data.shifts.filter((s) => dates.includes(s.date)),
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
    ]);
  }
  styleSheet(report);
  const swaps = wb.addWorksheet("جابه‌جایی‌ها");
  swaps.addRow([
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
      name(s.firstId),
      solarInput(s.firstDate),
      name(s.secondId),
      solarInput(s.secondDate),
      s.note,
      s.createdAt,
    ]);
  styleSheet(swaps);
  await writeWorkbook(
    wb,
    `برنامه-شیفت-${solarInput(dates[0]).slice(0, 7).replace("/", "-")}.xlsx`,
  );
}

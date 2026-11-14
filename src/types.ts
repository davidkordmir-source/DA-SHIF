export type Person = {
  id: string;
  name: string;
  department: string;
  active: boolean;
  reserveOnly: boolean;
};
export type AttendanceStatus = "present" | "excused" | "unexcused";
export type Attendance = {
  personId: string;
  status: AttendanceStatus;
  note: string;
  replacementId?: string;
};
export type Shift = {
  scheduleId?: string;
  date: string;
  primary: string[];
  reserve: string[];
  attendance: Attendance[];
};
export type Swap = {
  id: string;
  createdAt: string;
  firstDate: string;
  secondDate: string;
  firstId: string;
  secondId: string;
  note: string;
};
export type ReserveChange = {
  id: string;
  createdAt: string;
  date: string;
  previousIds: string[];
  nextIds: string[];
  note: string;
  source: "manual" | "attendance";
};
export type CustomEvent = {
  date: string;
  title: string;
  holiday: boolean;
  override?: boolean;
};
export type Settings = {
  primaryCount: number;
  reserveCount: number;
  minRestDays: number;
  hijriOffset: number;
};
export type ScheduleList = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  personIds: string[];
  location?: string;
};
export type ShiftArchive = {
  id: string;
  schedule: ScheduleList;
  createdAt: string;
  recordedBy: string;
  reason: string;
  rights: "preserve" | "mistake";
  restAcknowledged: true;
  creditedDates: string[];
  snapshot: {
    people: Person[];
    shifts: Shift[];
    swaps: Swap[];
    reserveChanges: ReserveChange[];
    settings: Settings;
    events: CustomEvent[];
  };
};
export type ShiftReminder = {
  enabled: boolean;
  scheduleId: string;
  time: string;
  daysBefore: number;
};
export type AppData = {
  version: 1;
  demo: boolean;
  people: Person[];
  shifts: Shift[];
  swaps: Swap[];
  reserveChanges?: ReserveChange[];
  events: CustomEvent[];
  settings: Settings;
  schedulingWarnings?: Record<string, string[]>;
  schedules?: ScheduleList[];
  locations?: string[];
  archives?: ShiftArchive[];
  reminder?: ShiftReminder;
  appearance?: import("./lib/appearance").Appearance;
};

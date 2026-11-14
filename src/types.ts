export type PersonRole = "leader" | "companion" | "reserve";
export type Person = {
  id: string;
  name: string;
  department: string;
  active: boolean;
  reserveOnly: boolean;
  role?: PersonRole;
  phone?: string;
};
export type AttendanceStatus = "present" | "excused" | "unexcused";
export type Attendance = {
  personId: string;
  status: AttendanceStatus;
  note: string;
  replacementId?: string;
};
export type Shift = {
  id?: string;
  listId?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  primary: string[];
  leaders?: string[];
  reserve: string[];
  attendance: Attendance[];
};
export type Swap = {
  id: string;
  createdAt: string;
  firstDate: string;
  firstShiftId?: string;
  secondDate: string;
  secondShiftId?: string;
  firstId: string;
  secondId: string;
  note: string;
};
export type ReserveChange = {
  id: string;
  createdAt: string;
  date: string;
  shiftId?: string;
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
  leaderCount?: number;
  reserveCount: number;
  minRestDays: number;
  hijriOffset: number;
};
export type SchedulePlan = {
  id: string;
  listId?: string;
  title: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  shiftIds: string[];
  peopleIds: string[];
};
export type ScheduleList = {
  id: string;
  name: string;
  mode: "parallel" | "alternative";
};
export type ShiftChange = {
  id: string;
  createdAt: string;
  shiftId: string;
  date: string;
  previous: Shift;
  next: Shift;
  note: string;
  restOverride: boolean;
};
export type ReminderSettings = {
  enabled: boolean;
  time: string;
  runAtLogin: boolean;
};
export type AppData = {
  version: 1;
  demo: boolean;
  people: Person[];
  shifts: Shift[];
  swaps: Swap[];
  reserveChanges?: ReserveChange[];
  shiftChanges?: ShiftChange[];
  plans?: SchedulePlan[];
  scheduleLists?: ScheduleList[];
  reserveQueue?: string[];
  reserveQueues?: Record<string, string[]>;
  reminder?: ReminderSettings;
  events: CustomEvent[];
  settings: Settings;
  schedulingWarnings?: Record<string, string[]>;
  appearance?: import("./lib/appearance").Appearance;
};

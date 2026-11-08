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
export type AppData = {
  version: 1;
  demo: boolean;
  people: Person[];
  shifts: Shift[];
  swaps: Swap[];
  events: CustomEvent[];
  settings: Settings;
  schedulingWarnings?: Record<string, string[]>;
};

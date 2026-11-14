import type { AppData } from "../src/types";
export function dueReminders(
  data: AppData,
  now?: Date,
): { key: string; title: string; body: string }[];

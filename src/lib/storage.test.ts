import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "../types";
import { loadData, parseBackup, saveData, STORAGE_BACKUP_KEY, STORAGE_KEY, validateBackup } from "./storage";

function fixture(): AppData {
  return {
    version: 1,
    demo: false,
    people: [
      { id: "1", name: "کارمند اول", department: "عملیات", active: true, reserveOnly: false },
      { id: "2", name: "کارمند دوم", department: "عملیات", active: true, reserveOnly: false },
    ],
    shifts: [{ date: "2026-11-15", primary: ["1"], reserve: ["2"], attendance: [] }],
    swaps: [],
    events: [],
    settings: { primaryCount: 1, reserveCount: 1, minRestDays: 1, hijriOffset: 0 },
    appearance: { theme: "ocean", font: "amiri" },
  };
}

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("storage recovery", () => {
  it("repairs an unknown font without discarding staff, shifts, or a supported theme", () => {
    const data = fixture();
    const result = validateBackup({ ...data, appearance: { theme: "ocean", font: "old-font" } });
    expect(result).toEqual({ ...data, appearance: { theme: "ocean", font: "vazirmatn" } });
  });

  it("refuses to persist records that would fail validation on the next launch", () => {
    const data = fixture();
    saveData(data);
    data.shifts[0].reserve = ["unknown"];
    expect(() => saveData(data)).toThrow();
    expect(JSON.parse(stored.get(STORAGE_KEY)!)).toEqual(fixture());
  });

  it("loads a validated desktop backup when the main file is corrupt", () => {
    vi.stubGlobal("window", { desktop: {
      readData: () => ({ ok: true, data: "{broken" }),
      readBackup: () => ({ ok: true, data: JSON.stringify(fixture()) }),
    } });
    const loaded = loadData();
    expect(loaded.data).toEqual(fixture());
    expect(loaded.error).toBeUndefined();
  });

  it("reads JSON with a Windows UTF-8 BOM", () => {
    expect(parseBackup(`\uFEFF${JSON.stringify(fixture())}`)).toEqual(fixture());
  });

  it("does not mask a valid primary with an older backup", () => {
    const data = fixture();
    stored.set(STORAGE_KEY, JSON.stringify(data));
    stored.set(STORAGE_BACKUP_KEY, "{broken");
    const loaded = loadData();
    expect(loaded.data).toEqual(data);
    expect(loaded.source).toBe("primary");
    expect(loaded.needsSave).toBeFalsy();
  });

  it("recovers a missing primary from the backup instead of creating demo data", () => {
    stored.set(STORAGE_BACKUP_KEY, JSON.stringify(fixture()));
    const loaded = loadData();
    expect(loaded.data).toEqual(fixture());
    expect(loaded.source).toBe("backup");
  });

  it("does not replace unreadable records with demo data or write during loading", () => {
    stored.set(STORAGE_KEY, "{broken");
    stored.set(STORAGE_BACKUP_KEY, JSON.stringify({ ...fixture(), shifts: [{ date: "invalid" }] }));
    const original = new Map(stored);
    const loaded = loadData();
    expect(loaded.source).toBe("unavailable");
    expect(loaded.data.demo).toBe(false);
    expect(loaded.data.people).toEqual([]);
    expect(loaded.error).toContain("فایل‌ها را حذف نکنید");
    expect(stored).toEqual(original);
  });

  it("does not roll back to an older backup when the primary file is only temporarily inaccessible", () => {
    const readBackup = vi.fn(() => ({ ok: true, data: JSON.stringify(fixture()) }));
    vi.stubGlobal("window", { desktop: {
      readData: () => ({ ok: false, error: "فایل موقتاً قفل شده است." }),
      readBackup,
    } });
    const loaded = loadData();
    expect(loaded.source).toBe("unavailable");
    expect(loaded.error).toContain("قفل");
    expect(readBackup).not.toHaveBeenCalled();
  });

  it("retains the previous browser backup across reopening and archives corrupt originals", () => {
    const data = fixture();
    saveData(data);
    const changed = { ...data, appearance: { theme: "midnight", font: "estedad" } } as AppData;
    saveData(changed);
    expect(JSON.parse(stored.get(STORAGE_BACKUP_KEY)!)).toEqual(data);
    expect(loadData().needsSave).toBeFalsy();
    saveData(changed);
    expect(JSON.parse(stored.get(STORAGE_BACKUP_KEY)!)).toEqual(data);
    stored.set(STORAGE_KEY, "{broken");
    const recovered = loadData();
    saveData(recovered.data, true);
    expect(JSON.parse(stored.get(STORAGE_KEY)!)).toEqual(data);
    expect([...stored.entries()].some(([key, value]) => key.includes(":recovery:") && value === "{broken")).toBe(true);
  });

  it("keeps the main data unchanged when there is no space to write the backup", () => {
    saveData(fixture());
    const original = stored.get(STORAGE_KEY);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: () => { throw new DOMException("Storage full", "QuotaExceededError"); },
    });
    const next = { ...fixture(), demo: true };
    expect(() => saveData(next)).toThrow();
    expect(stored.get(STORAGE_KEY)).toBe(original);
  });
});

const fs = require("node:fs");
const path = require("node:path");
const MAX_BYTES = 10 * 1024 * 1024;

function createDataStore(directory) {
  const file = path.join(directory, "hamshift-data.json");
  return {
    file,
    read() {
      try {
        if (!fs.existsSync(file)) return { ok: true, data: null };
        if (fs.statSync(file).size > MAX_BYTES)
          throw new Error("Data file exceeds the size limit");
        return { ok: true, data: fs.readFileSync(file, "utf8") };
      } catch {
        return {
          ok: false,
          error:
            "خواندن فایل داده‌های برنامه ممکن نیست. فایل اصلی بازنویسی نخواهد شد.",
        };
      }
    },
    write(json) {
      try {
        if (typeof json !== "string" || Buffer.byteLength(json) > MAX_BYTES)
          throw new Error("Invalid size");
        const parsed = JSON.parse(json);
        if (
          parsed?.version !== 1 ||
          !Array.isArray(parsed.people) ||
          !Array.isArray(parsed.shifts)
        )
          throw new Error("Invalid data");
        fs.mkdirSync(directory, { recursive: true });
        const temporary = file + ".tmp";
        const fd = fs.openSync(temporary, "w", 0o600);
        try {
          fs.writeFileSync(fd, json, "utf8");
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        // A malformed original is never copied over the last known good backup.
        if (fs.existsSync(file)) {
          try {
            JSON.parse(fs.readFileSync(file, "utf8"));
            fs.copyFileSync(file, file + ".bak");
          } catch {
            /* Retain the existing backup. */
          }
        }
        fs.renameSync(temporary, file);
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "نوشتن فایل داده‌ها انجام نشد. فضای آزاد و دسترسی به پوشهٔ برنامه را بررسی کنید.",
        };
      }
    },
  };
}
module.exports = { createDataStore };

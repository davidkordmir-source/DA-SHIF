const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const MAX_BYTES = 10 * 1024 * 1024;

function failure(error) {
  const code = error.code || "EIO";
  const messages = {
    ENOSPC: "فضای دیسک کافی نیست. فضای آزاد را بررسی و دوباره تلاش کنید؛ اطلاعات قبلی حفظ شده‌اند.",
    EDQUOT: "سهم فضای ذخیره‌سازی پر شده است. فضای آزاد را بررسی و دوباره تلاش کنید.",
    EACCES: "دسترسی به فایل اطلاعات بسته است یا فایل موقتاً قفل شده است. دسترسی پوشه را بررسی و دوباره تلاش کنید؛ فایل‌ها را حذف نکنید.",
    EPERM: "دسترسی به فایل اطلاعات بسته است یا فایل موقتاً قفل شده است. دسترسی پوشه را بررسی و دوباره تلاش کنید؛ فایل‌ها را حذف نکنید.",
    EBUSY: "فایل اطلاعات موقتاً توسط برنامهٔ دیگری قفل شده است. دوباره تلاش کنید؛ اطلاعات قبلی حفظ شده‌اند.",
    ETOOBIG: "حجم فایل اطلاعات بیشتر از ۱۰ مگابایت است. فایل اصلی حفظ شده و به بررسی نیاز دارد.",
    EINVALID: "ساختار اطلاعات برای ذخیره‌سازی معتبر نیست. فایل قبلی تغییر نکرده است.",
    EROFS: "پوشهٔ اطلاعات فقط خواندنی است. دسترسی نوشتن را بررسی و دوباره تلاش کنید.",
  };
  return {
    ok: false,
    code,
    error: messages[code] || "دسترسی به فایل اطلاعات انجام نشد. دوباره تلاش کنید؛ فایل‌های داده را حذف نکنید.",
  };
}

function validPayload(json) {
  try {
    const parsed = JSON.parse(json.replace(/^\uFEFF/, ""));
    return parsed?.version === 1 && Array.isArray(parsed.people) && Array.isArray(parsed.shifts);
  } catch {
    return false;
  }
}

function createDataStore(directory, io = fs) {
  const file = path.join(directory, "hamshift-data.json");
  const backup = file + ".bak";
  const read = (target) => {
    try {
      if (io.statSync(target).size > MAX_BYTES)
        throw Object.assign(new Error("Data file exceeds the size limit"), { code: "ETOOBIG" });
      return { ok: true, data: io.readFileSync(target, "utf8") };
    } catch (error) {
      if (error.code === "ENOENT") return { ok: true, data: null };
      return failure(error);
    }
  };
  const syncWrite = (target, contents) => {
    const fd = io.openSync(target, "wx", 0o600);
    try {
      io.writeFileSync(fd, contents, "utf8");
      io.fsyncSync(fd);
    } finally {
      io.closeSync(fd);
    }
  };
  const replace = (temporary, target) => {
    for (let attempt = 0; ; attempt++) {
      try {
        io.renameSync(temporary, target);
        return;
      } catch (error) {
        if (attempt >= 3 || !["EACCES", "EPERM", "EBUSY"].includes(error.code)) throw error;
        // Antivirus and indexing on Windows can briefly lock a destination.
        // Never delete that destination to work around a failed replacement.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
      }
    }
  };
  const archive = (contents, name = "hamshift-data") => {
    syncWrite(path.join(directory, `${name}.recovery-${Date.now()}-${randomUUID()}.json`), contents);
  };
  return {
    file,
    read: () => read(file),
    readBackup: () => read(backup),
    write(json, recovering = false) {
      const temporary = `${file}.${randomUUID()}.tmp`;
      const backupTemporary = `${backup}.${randomUUID()}.tmp`;
      try {
        if (typeof json !== "string" || !validPayload(json))
          throw Object.assign(new Error("Invalid data"), { code: "EINVALID" });
        if (Buffer.byteLength(json) > MAX_BYTES)
          throw Object.assign(new Error("Invalid size"), { code: "ETOOBIG" });
        io.mkdirSync(directory, { recursive: true });
        let previous = null;
        try {
          previous = io.readFileSync(file, "utf8");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        // Opening the app or saving identical data must not rotate the backup.
        if (previous === json && !recovering) return { ok: true };
        syncWrite(temporary, json);
        if (previous !== null && (recovering || !validPayload(previous))) {
          // Preserve the exact original, including semantically invalid JSON,
          // before restoring a renderer-validated backup or imported file.
          archive(previous);
        } else if (previous !== null) {
          syncWrite(backupTemporary, previous);
          replace(backupTemporary, backup);
        }
        if (recovering) {
          let oldBackup = null;
          try { oldBackup = io.readFileSync(backup, "utf8"); }
          catch (error) { if (error.code !== "ENOENT") throw error; }
          if (oldBackup !== json) {
            if (oldBackup !== null) archive(oldBackup, "hamshift-backup");
            syncWrite(backupTemporary, json);
            replace(backupTemporary, backup);
          }
        } else if (previous === null) {
          const existing = read(backup);
          if (!existing.ok) throw Object.assign(new Error(existing.error), { code: existing.code });
          if (existing.data === null) {
            // A new installation has a fallback even before its second save.
            syncWrite(backupTemporary, json);
            replace(backupTemporary, backup);
          }
        }
        replace(temporary, file);
        return { ok: true };
      } catch (error) {
        return failure(error);
      } finally {
        for (const target of [temporary, backupTemporary]) {
          try { io.unlinkSync(target); } catch { /* Only our own temporary files. */ }
        }
      }
    },
  };
}
module.exports = { createDataStore };

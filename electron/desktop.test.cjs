const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDataStore } = require("./data-store.cjs");
const { loadBranding } = require("./branding.cjs");

test("desktop storage persists data atomically and retains a good previous backup", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hamshift-store-"));
  try {
    const store = createDataStore(dir);
    assert.deepEqual(store.read(), { ok: true, data: null });
    const first = JSON.stringify({
      version: 1,
      people: [{ id: "1" }],
      shifts: [],
      appearance: { theme: "violet", font: "estedad" },
    });
    const second = JSON.stringify({
      version: 1,
      people: [{ id: "2" }],
      shifts: [],
    });
    assert.equal(store.write(first).ok, true);
    assert.equal(store.readBackup().data, first);
    assert.equal(store.write(second).ok, true);
    assert.equal(store.read().data, second);
    assert.equal(fs.readFileSync(store.file + ".bak", "utf8"), first);
    assert.equal(store.write(second).ok, true);
    assert.equal(fs.readFileSync(store.file + ".bak", "utf8"), first, "an unchanged save must not rotate the backup");
    assert.equal(store.write("not json").ok, false);
    assert.equal(store.read().data, second);
    fs.writeFileSync(store.file, "{broken");
    assert.equal(store.write(second).ok, true);
    assert.equal(fs.readFileSync(store.file + ".bak", "utf8"), first);
    assert.equal(fs.existsSync(store.file + ".tmp"), false);
    const archives = fs.readdirSync(dir).filter((name) => name.startsWith("hamshift-data.recovery-"));
    assert.equal(archives.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, archives[0]), "utf8"), "{broken");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restoring a validated backup preserves a syntactically valid but incompatible original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hamshift-restore-"));
  try {
    const store = createDataStore(dir);
    const original = JSON.stringify({ version: 1, people: [], shifts: [{ date: "bad" }] });
    const good = JSON.stringify({ version: 1, people: [], shifts: [] });
    fs.writeFileSync(store.file, original);
    fs.writeFileSync(store.file + ".bak", good);
    assert.equal(store.write(good, true).ok, true);
    assert.equal(store.read().data, good);
    assert.equal(store.readBackup().data, good);
    const archive = fs.readdirSync(dir).find((name) => name.startsWith("hamshift-data.recovery-"));
    assert.ok(archive);
    assert.equal(fs.readFileSync(path.join(dir, archive), "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a transient Windows replacement lock is retried without deleting the original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hamshift-lock-"));
  try {
    const store = createDataStore(dir);
    const first = JSON.stringify({ version: 1, people: [], shifts: [] });
    const second = JSON.stringify({ version: 1, people: [{ id: "1" }], shifts: [] });
    assert.equal(store.write(first).ok, true);
    let blocked = true;
    const locked = createDataStore(dir, {
      ...fs,
      renameSync(source, destination) {
        if (destination === store.file && blocked) {
          blocked = false;
          assert.equal(fs.readFileSync(store.file, "utf8"), first);
          throw Object.assign(new Error("File locked"), { code: "EPERM" });
        }
        fs.renameSync(source, destination);
      },
    });
    assert.equal(locked.write(second).ok, true);
    assert.equal(blocked, false);
    assert.equal(store.read().data, second);
    assert.equal(store.readBackup().data, first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("disk-full and backup failures leave the last committed data and backup intact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hamshift-full-"));
  try {
    const store = createDataStore(dir);
    const first = JSON.stringify({ version: 1, people: [], shifts: [] });
    const second = JSON.stringify({ version: 1, people: [{ id: "1" }], shifts: [] });
    const next = JSON.stringify({ version: 1, people: [{ id: "2" }], shifts: [] });
    assert.equal(store.write(first).ok, true);
    assert.equal(store.write(second).ok, true);
    const full = createDataStore(dir, {
      ...fs,
      writeFileSync() { throw Object.assign(new Error("Disk full"), { code: "ENOSPC" }); },
    });
    assert.equal(full.write(next).code, "ENOSPC");
    const backupFailure = createDataStore(dir, {
      ...fs,
      renameSync(source, destination) {
        if (destination.endsWith(".bak")) throw Object.assign(new Error("Backup failed"), { code: "EIO" });
        fs.renameSync(source, destination);
      },
    });
    assert.equal(backupFailure.write(next).ok, false);
    assert.equal(store.read().data, second);
    assert.equal(store.readBackup().data, first);
    assert.equal(fs.readdirSync(dir).some((name) => name.endsWith(".tmp")), false);
    assert.equal(store.write(next).ok, true, "a failed write must remain retryable");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("access failures are reported rather than mistaken for a new installation", () => {
  const denied = createDataStore("/unused", {
    ...fs,
    statSync() { throw Object.assign(new Error("Access denied"), { code: "EACCES" }); },
  });
  assert.equal(denied.read().ok, false);
  assert.equal(denied.read().code, "EACCES");
});

test("splash finds a supported image beside the executable and falls back safely", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hamshift-brand-"));
  const icon = path.join(__dirname, "../assets/hamshift.png");
  try {
    assert.equal(loadBranding(dir, icon).custom, false);
    fs.writeFileSync(path.join(dir, "splash-logo.png"), "not an image");
    assert.equal(loadBranding(dir, icon).custom, false);
    fs.copyFileSync(icon, path.join(dir, "splash-logo.png"));
    const result = loadBranding(dir, icon);
    assert.equal(result.custom, true);
    assert.equal(result.fileName, "splash-logo.png");
    assert.ok(result.logo.startsWith("data:image/png;base64,"));
    fs.writeFileSync(
      path.join(dir, "splash-logo.png"),
      Buffer.alloc(6 * 1024 * 1024),
    );
    assert.equal(loadBranding(dir, icon).custom, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
    assert.equal(store.write(second).ok, true);
    assert.equal(store.read().data, second);
    assert.equal(fs.readFileSync(store.file + ".bak", "utf8"), first);
    assert.equal(store.write("not json").ok, false);
    assert.equal(store.read().data, second);
    fs.writeFileSync(store.file, "{broken");
    assert.equal(store.write(second).ok, true);
    assert.equal(fs.readFileSync(store.file + ".bak", "utf8"), first);
    assert.equal(fs.existsSync(store.file + ".tmp"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

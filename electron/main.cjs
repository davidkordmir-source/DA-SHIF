const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeImage,
  session,
  Notification,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createDataStore } = require("./data-store.cjs");
const { loadBranding, imageMime, MAX_LOGO_BYTES } = require("./branding.cjs");
const APP_ROOT = path.join(__dirname, "..");
const ICON = path.join(APP_ROOT, "assets", "hamshift.png");
const PRELOAD = path.join(__dirname, "preload.cjs");
let mainWindow, splashWindow, showTimer;
let storage, installDirectory;
const testing = process.env.HAMSHIFT_TEST === "1" && !app.isPackaged;
if (testing && process.env.HAMSHIFT_TEST_DATA)
  app.setPath("userData", process.env.HAMSHIFT_TEST_DATA);
app.setName("Hamshift");
app.setAppUserModelId("ir.hamshift.desktop");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        "هم‌شیفت",
        "راه‌اندازی برنامه انجام نشد.\n" + error.message,
      );
      app.quit();
    });
}

function validSender(event, splashAllowed = false) {
  return (
    event.sender === mainWindow?.webContents ||
    (splashAllowed && event.sender === splashWindow?.webContents)
  );
}
function setupIpc() {
  ipcMain.on("data:read", (event) => {
    event.returnValue = validSender(event) ? storage.read() : { ok: false };
  });
  ipcMain.on("data:write", (event, json) => {
    event.returnValue = validSender(event)
      ? storage.write(json)
      : { ok: false };
  });
  ipcMain.on("app:ready", (event) => {
    if (validSender(event)) reveal();
  });
  ipcMain.handle(
    "reminder:status",
    (event) => validSender(event) && Notification.isSupported(),
  );
  ipcMain.handle("branding:read", (event) => {
    if (!validSender(event, true)) throw new Error("Invalid sender");
    return loadBranding(installDirectory, ICON);
  });
  ipcMain.handle("folder:install", (event) => {
    if (validSender(event)) return shell.openPath(installDirectory);
  });
  ipcMain.handle("folder:data", (event) => {
    if (validSender(event)) return shell.openPath(app.getPath("userData"));
  });
  ipcMain.handle("branding:choose", async (event) => {
    if (!validSender(event)) throw new Error("Invalid sender");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "انتخاب لوگوی صفحهٔ شروع",
      properties: ["openFile"],
      filters: [
        { name: "تصویر لوگو", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });
    if (result.canceled || !result.filePaths[0])
      return { ok: false, cancelled: true };
    try {
      const selected = result.filePaths[0];
      if (fs.statSync(selected).size > MAX_LOGO_BYTES)
        return { ok: false, error: "حجم لوگو نباید بیشتر از ۵ مگابایت باشد." };
      const buffer = fs.readFileSync(selected);
      if (!imageMime(buffer))
        return {
          ok: false,
          error: "یک تصویر سالم با فرمت PNG، JPG یا WEBP انتخاب کنید.",
        };
      let image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty())
        return { ok: false, error: "تصویر قابل خواندن نیست." };
      const { width, height } = image.getSize();
      if (width > 1200 || height > 1200)
        image = image.resize(
          width >= height ? { width: 1200 } : { height: 1200 },
        );
      const target = path.join(installDirectory, "splash-logo.png");
      if (fs.existsSync(target)) {
        const answer = await dialog.showMessageBox(mainWindow, {
          type: "question",
          title: "تغییر لوگوی شروع",
          message: "لوگوی شروع قبلی با تصویر انتخاب‌شده جایگزین شود؟",
          buttons: ["جایگزین شود", "انصراف"],
          defaultId: 1,
          cancelId: 1,
        });
        if (answer.response !== 0) return { ok: false, cancelled: true };
      }
      fs.writeFileSync(target, image.toPNG());
      return { ok: true };
    } catch {
      return {
        ok: false,
        error:
          "ذخیرهٔ لوگو در پوشهٔ نصب ممکن نیست. فایل splash-logo.png را دستی کنار Hamshift.exe قرار دهید.",
      };
    }
  });
}

function harden(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
}
let startedAt = 0,
  revealed = false;
function reveal() {
  if (revealed || !mainWindow || mainWindow.isDestroyed()) return;
  revealed = true;
  clearTimeout(showTimer);
  const minimum = testing
    ? Math.min(5000, Number(process.env.HAMSHIFT_TEST_SPLASH_MS) || 100)
    : 1500;
  const wait = Math.max(0, minimum - (Date.now() - startedAt));
  setTimeout(() => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
  }, wait);
}
async function start() {
  installDirectory = app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : testing && process.env.HAMSHIFT_TEST_INSTALL
      ? process.env.HAMSHIFT_TEST_INSTALL
      : APP_ROOT;
  storage = createDataStore(app.getPath("userData"));
  // This application has no network features. Enforce offline behavior in the
  // desktop shell, including external requests hidden in custom content.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: /^https?:|^wss?:|^ftp:/i.test(details.url) }),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  setupIpc();
  startedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 520,
    height: 390,
    frame: false,
    resizable: false,
    show: false,
    center: true,
    backgroundColor: "#101f2c",
    icon: ICON,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      devTools: testing,
    },
  });
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 850,
    minHeight: 650,
    show: false,
    backgroundColor: "#f6f8f9",
    title: "هم‌شیفت | مدیریت شیفت پرسنل",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      devTools: testing,
    },
  });
  mainWindow.removeMenu();
  harden(mainWindow);
  harden(splashWindow);
  splashWindow.once("ready-to-show", () => splashWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    app.quit();
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, description) => {
    if (code !== -3) {
      dialog.showErrorBox(
        "هم‌شیفت",
        "بارگذاری برنامه انجام نشد.\n" + description,
      );
      app.quit();
    }
  });
  const stored = storage.read();
  let theme = "emerald";
  try {
    theme = JSON.parse(stored.data)?.appearance?.theme || theme;
  } catch {
    /* The main UI reports malformed data without overwriting it. */
  }
  await splashWindow.loadFile(path.join(__dirname, "splash.html"), {
    query: { theme },
  });
  await mainWindow.loadFile(path.join(APP_ROOT, "dist", "index.html"));
  showTimer = setTimeout(reveal, 15000);
  // Native reminders keep running while the window is minimized. Delivery keys
  // live beside user data and are persisted, so restarting cannot notify twice.
  const { dueReminders } = await import("./reminders.mjs");
  const deliveryPath = path.join(
    app.getPath("userData"),
    "reminder-deliveries.json",
  );
  let delivered = [];
  try {
    const value = JSON.parse(fs.readFileSync(deliveryPath, "utf8"));
    if (Array.isArray(value))
      delivered = value.filter((k) => typeof k === "string");
  } catch {
    /* First run. */
  }
  const checkReminders = () => {
    if (!Notification.isSupported()) return;
    try {
      const result = storage.read();
      if (!result.ok || !result.data) return;
      for (const item of dueReminders(JSON.parse(result.data))) {
        if (delivered.includes(item.key)) continue;
        const notification = new Notification({
          title: item.title,
          body: item.body,
          icon: ICON,
        });
        notification.on("click", () => {
          if (mainWindow) {
            mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notification.show();
        delivered = [...delivered, item.key].slice(-2000);
        fs.writeFileSync(`${deliveryPath}.tmp`, JSON.stringify(delivered));
        fs.renameSync(`${deliveryPath}.tmp`, deliveryPath);
      }
    } catch {
      /* In-app reminders remain available if the OS service fails. */
    }
  };
  checkReminders();
  const reminderTimer = setInterval(checkReminders, 15000);
  app.once("before-quit", () => clearInterval(reminderTimer));
}
app.on("window-all-closed", () => app.quit());

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeImage,
  session,
  Notification,
  Tray,
  Menu,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createDataStore } = require("./data-store.cjs");
const { loadBranding, imageMime, MAX_LOGO_BYTES } = require("./branding.cjs");
const {
  createReminderService,
  ensureNotificationShortcut,
} = require("./reminders.cjs");
const APP_ROOT = path.join(__dirname, "..");
const ICON = path.join(APP_ROOT, "assets", "hamshift.png");
const PRELOAD = path.join(__dirname, "preload.cjs");
let mainWindow, splashWindow, showTimer;
let storage, installDirectory;
let latestData = null,
  reminders,
  tray,
  quitting = false;
app.on("before-quit", () => {
  quitting = true;
  reminders?.stop();
});
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
    if (!validSender(event)) {
      event.returnValue = { ok: false };
      return;
    }
    const result = storage.write(json);
    if (result.ok) {
      latestData = JSON.parse(json);
      configureReminder();
    }
    event.returnValue = result;
  });
  ipcMain.handle("reminder:test", (event) => {
    if (!validSender(event)) throw new Error("Invalid sender");
    if (process.platform !== "win32" || !Notification.isSupported())
      return {
        ok: false,
        error:
          "اعلان سیستمی در نسخهٔ نصب‌شدهٔ ویندوز و با مجوز اعلان‌ها قابل استفاده است.",
      };
    return { ok: reminders.test() };
  });
  ipcMain.on("app:ready", (event) => {
    if (validSender(event)) reveal();
  });
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
  if (process.platform === "win32" && app.isPackaged) {
    try {
      if (
        !ensureNotificationShortcut({
          appData: app.getPath("appData"),
          executable: app.getPath("exe"),
          writeShortcutLink: (...args) => shell.writeShortcutLink(...args),
        })
      )
        console.error("Could not register the Windows notification shortcut.");
    } catch (error) {
      console.error(
        "Notification shortcut registration failed:",
        error.message,
      );
    }
  }
  const initial = storage.read();
  try {
    latestData = initial.ok && initial.data ? JSON.parse(initial.data) : null;
  } catch {
    /* UI handles damaged data. */
  }
  reminders = createReminderService({
    directory: app.getPath("userData"),
    getData: () => latestData,
    show: ({ title, body }) => {
      if (process.platform !== "win32" || !Notification.isSupported())
        return false;
      const notification = new Notification({
        title,
        body,
        icon: ICON,
        timeoutType: "never",
      });
      notification.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notification.show();
      return true;
    },
  });
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
      devTools: testing,
    },
  });
  mainWindow.removeMenu();
  mainWindow.on("close", (event) => {
    if (
      !quitting &&
      process.platform === "win32" &&
      latestData?.reminder?.enabled &&
      tray
    ) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  configureReminder();
  reminders.start();
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
}
function configureReminder() {
  if (process.platform !== "win32" || testing) return;
  const settings = latestData?.reminder;
  try {
    if (app.isPackaged)
      app.setLoginItemSettings({
        name: "Hamshift",
        openAtLogin: !!settings?.enabled && !!settings?.runAtLogin,
      });
    if (settings?.enabled && !tray) {
      tray = new Tray(ICON);
      tray.setToolTip("هم‌شیفت · یادآور شیفت");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "نمایش هم‌شیفت",
            click: () => {
              mainWindow?.show();
              mainWindow?.focus();
            },
          },
          { label: "خروج", click: () => app.quit() },
        ]),
      );
      tray.on("double-click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
    } else if (!settings?.enabled && tray) {
      tray.destroy();
      tray = null;
    }
  } catch (error) {
    console.error("Reminder configuration failed:", error.message);
  }
}
app.on("window-all-closed", () => app.quit());

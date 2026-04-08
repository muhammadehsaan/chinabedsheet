const { app, BrowserWindow, Menu, dialog } = require("electron");
const { fork } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const APP_NAME = "China Bedsheet Store";
const BACKEND_PORT = 5000;
const HEALTHCHECK_URL = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`;

let mainWindow = null;
let spawnedBackend = null;

app.setName(APP_NAME);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBackendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(__dirname, "..", "..", "backend");
}

function getFrontendEntry() {
  return path.join(__dirname, "..", "dist", "index.html");
}

function getLoadingScreen() {
  return path.join(__dirname, "loading.html");
}

function getRuntimeConfigPath() {
  return path.join(app.getPath("userData"), "backend.env");
}

function normalizeDatabaseUrl(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return null;
  }

  const unwrapped =
    (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
      ? text.slice(1, -1)
      : text;

  let parsed;
  try {
    parsed = new URL(unwrapped);
  } catch (_error) {
    return null;
  }

  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    return null;
  }

  const neonMatch = parsed.hostname.match(/^(ep-[^.]+?)(-pooler)?(\.[^.]+\.aws\.neon\.tech)$/i);
  if (!neonMatch) {
    return null;
  }

  const [, projectHost, poolerSuffix, regionHost] = neonMatch;
  if (!poolerSuffix) {
    parsed.hostname = `${projectHost}-pooler${regionHost}`;
  }
  if (!parsed.searchParams.get("sslmode")) {
    parsed.searchParams.set("sslmode", "require");
  }
  if (!parsed.searchParams.get("channel_binding")) {
    parsed.searchParams.set("channel_binding", "require");
  }

  const normalized = parsed.toString();
  if (text.startsWith('"') && text.endsWith('"')) {
    return `"${normalized}"`;
  }
  if (text.startsWith("'") && text.endsWith("'")) {
    return `'${normalized}'`;
  }
  return normalized;
}

function migrateRuntimeConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return;
  }

  const currentText = fs.readFileSync(configPath, "utf8");
  const nextText = currentText.replace(/^DATABASE_URL=(.+)$/m, (fullMatch, value) => {
    const normalized = normalizeDatabaseUrl(value);
    return normalized ? `DATABASE_URL=${normalized}` : fullMatch;
  });

  if (nextText !== currentText) {
    fs.writeFileSync(configPath, nextText, "utf8");
  }
}

function ensureRuntimeConfig() {
  const configPath = getRuntimeConfigPath();
  const templatePath = path.join(__dirname, "backend.env.template");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(templatePath, configPath);
  }

  migrateRuntimeConfig(configPath);

  return configPath;
}

function checkBackendReady() {
  return new Promise((resolve) => {
    const req = http.get(HEALTHCHECK_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await checkBackendReady()) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }

  return false;
}

function startBundledBackend(configPath) {
  if (spawnedBackend) {
    return;
  }

  const backendRoot = getBackendRoot();
  const entryFile = path.join(backendRoot, "src", "server-electron.js");

  spawnedBackend = fork(entryFile, [], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(BACKEND_PORT),
      POS_ENV_FILE: configPath,
    },
    windowsHide: true,
  });

  spawnedBackend.on("exit", () => {
    spawnedBackend = null;
  });
}

function stopBundledBackend() {
  if (!spawnedBackend) {
    return;
  }

  spawnedBackend.kill();
  spawnedBackend = null;
}

function buildFailureHtml(configPath, errorMessage) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(APP_NAME)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
        font-family: Segoe UI, Arial, sans-serif;
      }
      main {
        width: min(680px, calc(100vw - 48px));
        padding: 32px;
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: 0 30px 60px rgba(2, 6, 23, 0.45);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 12px;
        color: #cbd5e1;
        line-height: 1.6;
      }
      code {
        display: block;
        margin-top: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.8);
        color: #93c5fd;
        word-break: break-all;
      }
      .error {
        margin-top: 16px;
        color: #fca5a5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Backend start nahi hua</h1>
      <p>PostgreSQL ya database config check karein. App runtime config yahan rakhi gayi hai:</p>
      <code>${escapeHtml(configPath)}</code>
      <p class="error">${escapeHtml(errorMessage)}</p>
    </main>
  </body>
</html>`;
}

async function bootApplication() {
  const backendAlreadyRunning = await checkBackendReady();

  if (!backendAlreadyRunning) {
    const configPath = ensureRuntimeConfig();
    startBundledBackend(configPath);

    const backendReady = await waitForBackend();
    if (!backendReady) {
      throw new Error("Local backend 30 seconds ke andar ready nahi hua.");
    }
  }

  await mainWindow.loadFile(getFrontendEntry());
}

function createWindow() {
  const devIconPath = path.join(__dirname, "..", "src", "assets", "company logo.png");
  const windowIcon = !app.isPackaged && fs.existsSync(devIconPath) ? devIconPath : undefined;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: "#020617",
    show: false,
    icon: windowIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.loadFile(getLoadingScreen());

  bootApplication().catch(async (error) => {
    const configPath = getRuntimeConfigPath();
    dialog.showErrorBox(
      APP_NAME,
      `Desktop app backend start nahi hua.\n\nConfig file:\n${configPath}\n\nError:\n${error.message}`,
    );
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        buildFailureHtml(configPath, error.message),
      )}`,
    );
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopBundledBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

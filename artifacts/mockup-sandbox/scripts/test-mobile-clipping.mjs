import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const viteEntry = path.join(packageRoot, "node_modules/vite/bin/vite.js");
const widths = [320, 390, 430];
const languages = [
  {
    code: "en",
    htmlLang: "en",
    titles: {
      home: "Let the songs",
      sessions: "Choose a live session",
      submit: "Put your song in the room",
      receipt: "You are in the room.",
      host: "Host desk",
      live: "Live mode",
    },
  },
  {
    code: "fr",
    htmlLang: "fr",
    titles: {
      home: "Que les chansons",
      sessions: "Choisissez une session LIVE",
      submit: "Placez votre chanson",
      receipt: "Vous êtes dans la salle.",
      host: "Régie",
      live: "Mode LIVE",
    },
  },
  {
    code: "ua",
    htmlLang: "uk",
    titles: {
      home: "Нехай пісні",
      sessions: "Оберіть LIVE-сесію",
      submit: "Помістіть свою пісню",
      receipt: "Ви в кімнаті.",
      host: "Пульт ведучого",
      live: "LIVE-режим",
    },
  },
];
const screens = ["home", "sessions", "submit", "receipt", "host", "live"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function findChromium() {
  const configured = process.env.CHROMIUM_BIN;
  if (configured) return configured;

  const onPath = spawnSync("which", ["chromium"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.trim();

  const replitChromium = "/repl/tools/bin/chromium";
  if (spawnSync("test", ["-x", replitChromium]).status === 0) {
    return replitChromium;
  }
  throw new Error(
    "Chromium is required for this browser test. Install Chromium or set CHROMIUM_BIN to its executable.",
  );
}

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.runtimeErrors = [];
    this.listeners = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.method === "Runtime.exceptionThrown") {
        this.runtimeErrors.push(message.params.exceptionDetails.text);
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params, message.sessionId);
        }
      }
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(`${request.method}: ${message.error.message}`));
      } else {
        request.resolve(message.result);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new DevTools(socket);
  }

  waitForEvent(method, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 15000);
      const listener = (params, sessionId) => {
        if (!predicate(params, sessionId)) return;
        clearTimeout(timeout);
        listeners.delete(listener);
        resolve(params);
      };
      const listeners = this.listeners.get(method) ?? new Set();
      listeners.add(listener);
      this.listeners.set(method, listeners);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 15000);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.socket.send(JSON.stringify(message));
    });
  }

  async evaluate(expression, sessionId) {
    const response = await this.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      sessionId,
    );
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(description, check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function click(selector, devtools, sessionId) {
  const result = await devtools.evaluate(
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return { clicked: Boolean(element && !element.disabled), matchingTestIds: [...document.querySelectorAll('[data-testid]')].map((item) => item.getAttribute('data-testid')).slice(0, 20), url: location.href }; })()`,
    sessionId,
  );
  assert.equal(
    result.clicked,
    true,
    `Expected an enabled element matching ${selector}; page=${result.url}; test IDs=${result.matchingTestIds.join(", ")}`,
  );
  await devtools.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    sessionId,
  );
}

async function inspectScreen(devtools, sessionId, language, screen, width) {
  await waitFor(`${screen} screen`, () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="mobile-screen-${screen}"]') !== null`,
      sessionId,
    ),
  );
  await devtools.evaluate("new Promise(requestAnimationFrame)", sessionId);

  const result = await devtools.evaluate(
    `(() => {
      const width = window.innerWidth;
      const app = document.querySelector('.gofl-mobile');
      const main = document.querySelector('[data-testid="mobile-screen-${screen}"]');
      const heading = screenHeading();
      const clipping = [];
      if (!app || !main) return { error: 'Mobile screen did not render' };
      const appBounds = app.getBoundingClientRect();
      const outsideControls = [...app.querySelectorAll('button, a, input, select, textarea')]
        .filter((element) => element.getClientRects().length)
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < appBounds.left - 1 || bounds.right > appBounds.right + 1;
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: element.innerText?.trim().slice(0, 60) || element.getAttribute('aria-label') || '',
        }));

      if (document.documentElement.scrollWidth > width + 1) {
        clipping.push('document has horizontal overflow (' + document.documentElement.scrollWidth + 'px)');
      }
      if (appBounds.left < -1 || appBounds.right > width + 1) {
        clipping.push('mobile app is wider than the viewport');
      }
      if (outsideControls.length) {
        clipping.push('interactive controls extend beyond the app width: ' + JSON.stringify(outsideControls));
      }

      const ignored = (element) => Boolean(element.closest('.gm-queue-row'));
      const textWalker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = textWalker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const owner = node.parentElement;
        if (!owner || ignored(owner)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width || rect.height);
        for (let ancestor = owner; ancestor && ancestor !== app.parentElement; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const bounds = ancestor.getBoundingClientRect();
          const left = bounds.left + ancestor.clientLeft;
          const right = left + ancestor.clientWidth;
          const top = bounds.top + ancestor.clientTop;
          const bottom = top + ancestor.clientHeight;
          for (const rect of textRects) {
            if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < left - 1 || rect.right > right + 1)) {
              clipping.push('text is clipped horizontally: "' + node.textContent.trim().slice(0, 70) + '"');
              break;
            }
            if (['hidden', 'clip'].includes(style.overflowY) && (rect.top < top - 1 || rect.bottom > bottom + 1)) {
              clipping.push('text is clipped vertically: "' + node.textContent.trim().slice(0, 70) + '"');
              break;
            }
            if (rect.left < -1 || rect.right > width + 1) {
              clipping.push('text extends beyond the viewport: "' + node.textContent.trim().slice(0, 70) + '"');
              break;
            }
          }
          if (clipping.length > 30) break;
        }
      }

      function screenHeading() {
        if ('${screen}' === 'home') return document.querySelector('.gm-home-hero h1')?.textContent || '';
        if ('${screen}' === 'receipt') return document.querySelector('.gm-receipt h1')?.textContent || '';
        if ('${screen}' === 'host') return document.querySelector('.gm-host-header h1')?.textContent || '';
        if ('${screen}' === 'live') return document.querySelector('.gm-live-top h1')?.textContent || '';
        return document.querySelector('.gm-heading h1')?.textContent || '';
      }

      return {
        clipping: [...new Set(clipping)],
        title: heading,
        language: document.documentElement.lang,
        selectedLanguage: document.querySelector('[data-testid="language-${language.code}"]')?.getAttribute('aria-pressed'),
      };
    })()`,
    sessionId,
  );

  assert.equal(result.error, undefined, result.error);
  assert.equal(
    result.language,
    language.htmlLang,
    `Expected document language ${language.htmlLang} on ${screen} at ${width}px`,
  );
  assert.equal(
    result.selectedLanguage,
    "true",
    `Expected ${language.code} to be selected on ${screen} at ${width}px`,
  );
  assert.ok(
    result.title.includes(language.titles[screen]),
    `${screen} title was not translated to ${language.code}: ${result.title}`,
  );
  assert.deepEqual(
    result.clipping,
    [],
    `${language.code.toUpperCase()} ${screen} screen clips at ${width}px:\n${result.clipping.join("\n")}`,
  );
}

async function changeScreen(devtools, sessionId, screen) {
  if (screen === "sessions") {
    await click('[data-testid="nav-sessions"]', devtools, sessionId);
  } else if (screen === "submit") {
    await click('[data-testid="nav-submit"]', devtools, sessionId);
  } else if (screen === "receipt") {
    await devtools.evaluate(
      `(() => {
        const form = document.querySelector('.gm-submit-form');
        if (!form) return false;
        const inputs = form.querySelectorAll('input:not([type="checkbox"])');
        const values = ['Moon Orchard', 'Soft Landing', 'dream-pop', 'Canada', '', 'https://example.com/track'];
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        inputs.forEach((input, index) => {
          valueSetter.call(input, values[index] ?? '');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const intro = form.querySelector('textarea');
        const textSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        textSetter.call(intro, 'A short introduction for the host.');
        intro.dispatchEvent(new Event('input', { bubbles: true }));
        intro.dispatchEvent(new Event('change', { bubbles: true }));
        const rights = form.querySelector('input[type="checkbox"]');
        if (!rights.checked) rights.click();
        form.querySelector('.gm-submit-button').click();
        return true;
      })()`,
      sessionId,
    );
  } else if (screen === "host") {
    await click('[data-testid="nav-host"]', devtools, sessionId);
  } else if (screen === "live") {
    await click(".gm-host-open-live", devtools, sessionId);
  } else if (screen === "home") {
    await click('[data-testid="button-brand-home"]', devtools, sessionId);
  }
  await waitFor(`${screen} screen`, () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="mobile-screen-${screen}"]') !== null`,
      sessionId,
    ),
  );
}

async function main() {
  await access(viteEntry);
  const chromium = findChromium();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const previewUrl = `${baseUrl}/preview/gofl-mobile/MobileExperience`;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gofl-mobile-clipping-"));
  const server = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: packageRoot,
      env: { ...process.env, PORT: String(port), BASE_PATH: "/" },
      stdio: "ignore",
    },
  );
  let browser;
  let devtools;

  try {
    await waitFor("Vite preview server", async () => {
      if (server.exitCode !== null) throw new Error("Vite exited before becoming ready");
      try {
        return (await fetch(previewUrl)).ok;
      } catch {
        return false;
      }
    });

    const profileDir = path.join(tempDir, "profile");
    browser = spawn(
      chromium,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    const activePortFile = path.join(profileDir, "DevToolsActivePort");
    const activePort = await waitFor("Chromium DevTools", async () => {
      if (browser.exitCode !== null) throw new Error("Chromium exited before DevTools started");
      try {
        const content = await readFile(activePortFile, "utf8");
        const [debugPort, socketPath] = content.trim().split("\n");
        return { debugPort, socketPath };
      } catch {
        return false;
      }
    });

    devtools = await DevTools.connect(
      `ws://127.0.0.1:${activePort.debugPort}${activePort.socketPath}`,
    );
    const { targetId } = await devtools.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await devtools.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await devtools.send("Page.enable", {}, sessionId);
    await devtools.send("Runtime.enable", {}, sessionId);

    for (const width of widths) {
      await devtools.send(
        "Emulation.setDeviceMetricsOverride",
        { width, height: 900, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await devtools.send("Page.navigate", { url: previewUrl }, sessionId);
      await waitFor("mobile preview to render", () =>
        devtools.evaluate(
          "document.querySelector('[data-testid=\"mobile-screen-home\"]') !== null",
          sessionId,
        ),
      );
      await devtools.evaluate("localStorage.clear()", sessionId);
      const resetReloadComplete = devtools.waitForEvent(
        "Page.loadEventFired",
        (_params, eventSessionId) => eventSessionId === sessionId,
      );
      await devtools.send("Page.reload", { ignoreCache: true }, sessionId);
      await resetReloadComplete;
      await waitFor("home after resetting language", async () => {
        const state = await devtools.evaluate(
          `({ screen: Boolean(document.querySelector('[data-testid="mobile-screen-home"]')), language: Boolean(document.querySelector('[data-testid="language-fr"]')) })`,
          sessionId,
        );
        return state.screen && state.language;
      });

      await click('[data-testid="language-fr"]', devtools, sessionId);
      const storedLanguage = await devtools.evaluate(
        "localStorage.getItem('gfl-language')",
        sessionId,
      );
      assert.equal(storedLanguage, "fr", "Language selector did not persist French");
      const reloadComplete = devtools.waitForEvent(
        "Page.loadEventFired",
        (_params, eventSessionId) => eventSessionId === sessionId,
      );
      await devtools.send("Page.reload", { ignoreCache: true }, sessionId);
      await reloadComplete;
      await waitFor("saved French selection after reload", () =>
        devtools.evaluate(
          `document.querySelector('[data-testid="language-fr"]')?.getAttribute('aria-pressed') === 'true'`,
          sessionId,
        ),
      );

      for (const language of languages) {
        await click(`[data-testid="language-${language.code}"]`, devtools, sessionId);
        await waitFor(`${language.code} language selection`, () =>
          devtools.evaluate(
            `document.documentElement.lang === ${JSON.stringify(language.htmlLang)} && document.querySelector('[data-testid="language-${language.code}"]')?.getAttribute('aria-pressed') === 'true'`,
            sessionId,
          ),
        );
        await changeScreen(devtools, sessionId, "home");
        for (const screen of screens) {
          if (screen !== "home") await changeScreen(devtools, sessionId, screen);
          await inspectScreen(devtools, sessionId, language, screen, width);
        }
        console.log(`PASS ${language.code.toUpperCase()} at ${width}px: ${screens.join(", ")}`);
      }
    }

    assert.deepEqual(
      devtools.runtimeErrors,
      [],
      `Browser runtime errors:\n${devtools.runtimeErrors.join("\n")}`,
    );
    console.log("All localized mobile layout checks passed.");
  } finally {
    devtools?.close();
    if (browser && browser.exitCode === null) {
      browser.kill("SIGTERM");
      await Promise.race([once(browser, "exit"), delay(2000)]);
      if (browser.exitCode === null) browser.kill("SIGKILL");
    }
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"), delay(2000)]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
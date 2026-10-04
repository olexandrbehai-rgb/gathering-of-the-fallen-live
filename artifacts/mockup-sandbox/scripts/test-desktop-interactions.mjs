import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const viteEntry = path.join(packageRoot, "node_modules/vite/bin/vite.js");
const viewportWidths = [390, 1440];
const languages = [
  {
    code: "en",
    htmlLang: "en",
    title: {
      sessions: "Choose a live session",
      submit: "Put your song in the room",
      host: "Host desk",
      live: "Live mode",
    },
    sessionSelected: "Selected",
    sessionName: "Artist spotlight",
  },
  {
    code: "fr",
    htmlLang: "fr",
    title: {
      sessions: "Choisissez une session LIVE",
      submit: "Placez votre chanson dans la salle",
      host: "Régie",
      live: "Mode LIVE",
    },
    sessionSelected: "Sélectionnée",
    sessionName: "Coup de projecteur",
  },
  {
    code: "ua",
    htmlLang: "uk",
    title: {
      sessions: "Оберіть LIVE-сесію",
      submit: "Помістіть свою пісню в кімнату",
      host: "Пульт ведучого",
      live: "LIVE-режим",
    },
    sessionSelected: "Обрано",
    sessionName: "Фокус на артистах",
  },
];
const previews = {
  sessions: "CurrentSessions",
  submit: "CurrentSubmit",
  host: "CurrentHost",
  live: "CurrentLive",
};

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
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
  const onPath = spawnSync("which", ["chromium"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.trim();
  const replitChromium = "/repl/tools/bin/chromium";
  if (spawnSync("test", ["-x", replitChromium]).status === 0) return replitChromium;
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
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.method === "Runtime.exceptionThrown") {
        this.runtimeErrors.push(message.params.exceptionDetails.text);
      }
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
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
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
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
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || element.disabled) return false;
      element.click();
      return true;
    })()`,
    sessionId,
  );
  assert.equal(result, true, `Expected an enabled element matching ${selector}`);
}

async function clickButtonByText(text, devtools, sessionId, root = "main") {
  const result = await devtools.evaluate(
    `(() => {
      const buttons = [...document.querySelectorAll(${JSON.stringify(`${root} button`)})];
      const button = buttons.find((element) => element.textContent.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) {
        return { clicked: false, buttons: buttons.map((element) => element.textContent.trim()) };
      }
      button.click();
      return { clicked: true, buttons: buttons.map((element) => element.textContent.trim()) };
    })()`,
    sessionId,
  );
  assert.equal(
    result.clicked,
    true,
    `Could not click the enabled "${text}" button; available buttons: ${result.buttons.join(" | ")}`,
  );
}

async function navigateTo(kind, devtools, sessionId, baseUrl) {
  const url = `${baseUrl}/preview/gofl-current/${previews[kind]}`;
  await devtools.send("Page.navigate", { url }, sessionId);
  await waitFor(`${kind} preview to render`, () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="language-en"]') && document.querySelector('main h1')?.textContent.trim()`,
      sessionId,
    ),
  );
}

async function assertLanguage(language, kind, devtools, sessionId) {
  const actual = await devtools.evaluate(
    `(() => ({
      htmlLang: document.documentElement.lang,
      selected: document.querySelector('[data-testid="language-${language.code}"]')?.getAttribute('aria-pressed'),
      stored: localStorage.getItem('gfl-language'),
      title: document.querySelector('main h1')?.textContent.trim() || '',
    }))()`,
    sessionId,
  );
  assert.equal(actual.htmlLang, language.htmlLang, `${kind} preview has the wrong document language`);
  assert.equal(actual.selected, "true", `${kind} preview did not select ${language.code.toUpperCase()}`);
  assert.equal(actual.stored, language.code, `${kind} preview did not retain the saved language`);
  assert.ok(
    actual.title.includes(language.title[kind]),
    `${kind} title is not localized in ${language.code}: ${actual.title}`,
  );
}

async function checkLayout(kind, width, devtools, sessionId) {
  const result = await devtools.evaluate(
    `(() => {
      const app = document.querySelector('.gofl-current');
      if (!app) return { error: 'Gathering of the Fallen preview did not render' };
      const controlsOutsideViewport = [...app.querySelectorAll('button, a, input, select, textarea')]
        .filter((element) => element.getClientRects().length)
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > window.innerWidth + 1;
        })
        .map((element) => element.innerText?.trim() || element.getAttribute('aria-label') || element.tagName);
      return {
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        headingVisible: Boolean(document.querySelector('main h1')?.getClientRects().length),
        controlsOutsideViewport,
      };
    })()`,
    sessionId,
  );
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.width, width, `Browser did not use the requested ${width}px viewport`);
  assert.equal(
    result.documentWidth <= width + 1,
    true,
    `${kind} preview has horizontal overflow at ${width}px (${result.documentWidth}px)`,
  );
  assert.equal(result.headingVisible, true, `${kind} heading is not visible at ${width}px`);
  assert.deepEqual(
    result.controlsOutsideViewport,
    [],
    `${kind} controls extend beyond the ${width}px viewport`,
  );
}

async function selectLanguage(language, devtools, sessionId) {
  await click(`[data-testid="language-${language.code}"]`, devtools, sessionId);
  await waitFor(`${language.code} language switch`, () =>
    devtools.evaluate(
      `document.documentElement.lang === ${JSON.stringify(language.htmlLang)} && document.querySelector('[data-testid="language-${language.code}"]')?.getAttribute('aria-pressed') === 'true'`,
      sessionId,
    ),
  );
}

async function testSubmissionReceipt(devtools, sessionId) {
  await navigateTo("submit", devtools, sessionId, testBaseUrl);
  const formDetails = await devtools.evaluate(
    `(() => {
      const form = document.querySelector('[data-testid="form-submit-track"]');
      const fields = [...form.querySelectorAll('input:not([type="checkbox"])')];
      const values = [
        "Moon Orchard",
        "Soft Landing",
        "dream-pop",
        "Canada",
        "https://example.com/social",
        "https://example.com/track",
      ];
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      fields.forEach((field, index) => {
        inputSetter.call(field, values[index]);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const intro = form.querySelector("textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
        .set.call(intro, "A short introduction for the host.");
      intro.dispatchEvent(new Event("input", { bubbles: true }));
      intro.dispatchEvent(new Event("change", { bubbles: true }));
      const session = form.querySelector('[data-testid="select-session"]');
      session.value = "session-02";
      session.dispatchEvent(new Event("change", { bubbles: true }));
      form.querySelector('[data-testid="input-rights-accepted"]').click();
      return {
        inputCount: fields.length,
        selectedSession: session.value,
        rightsAccepted: form.querySelector('[data-testid="input-rights-accepted"]').checked,
        requiredControls: [...form.querySelectorAll(":required")].map((control) => ({
          tagName: control.tagName,
          type: control.type,
          value: control.value,
          checked: control.checked,
        })),
        fullSessionDisabled: form.querySelector('[data-testid="select-session"] option[value="session-03"]').disabled,
      };
    })()`,
    sessionId,
  );
  assert.equal(formDetails.inputCount, 6, "Unexpected number of text fields in the submission form");
  assert.equal(formDetails.selectedSession, "session-02", "The selected session did not change");
  assert.equal(formDetails.rightsAccepted, true, "Rights confirmation was not accepted");
  assert.deepEqual(
    formDetails.requiredControls.map(({ tagName, type }) => `${tagName}:${type}`),
    [
      "INPUT:text",
      "INPUT:text",
      "TEXTAREA:textarea",
      "INPUT:text",
      "INPUT:text",
      "INPUT:url",
      "SELECT:select-one",
      "INPUT:checkbox",
    ],
    "The form does not mark every required field and rights confirmation as required",
  );
  assert.equal(formDetails.fullSessionDisabled, true, "A full session is available in the submission form");

  const requiredControls = formDetails.requiredControls;
  for (let index = 0; index < requiredControls.length; index += 1) {
    const wasCleared = await devtools.evaluate(
      `(() => {
        const form = document.querySelector('[data-testid="form-submit-track"]');
        const control = [...form.querySelectorAll(":required")][${index}];
        if (control.type === "checkbox") {
          if (control.checked) control.click();
        } else {
          const prototype = control instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : control instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, "");
          control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
        }
        return control.type === "checkbox" ? !control.checked : control.value === "";
      })()`,
      sessionId,
    );
    assert.equal(wasCleared, true, `Could not omit required field ${index + 1}`);
    await click('[data-testid="button-submit-track"]', devtools, sessionId);
    const stillOnForm = await devtools.evaluate(
      `Boolean(document.querySelector('[data-testid="form-submit-track"]'))`,
      sessionId,
    );
    assert.equal(stillOnForm, true, `Omitting required field ${index + 1} showed a submission receipt`);

    await devtools.evaluate(
      `(() => {
        const form = document.querySelector('[data-testid="form-submit-track"]');
        const control = [...form.querySelectorAll(":required")][${index}];
        if (control.type === "checkbox") {
          if (control.checked !== ${requiredControls[index].checked}) control.click();
        } else {
          const value = ${JSON.stringify(requiredControls[index].value)};
          const prototype = control instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : control instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
          control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
        }
      })()`,
      sessionId,
    );
  }

  await devtools.evaluate(
    `(() => {
      const session = document.querySelector('[data-testid="select-session"]');
      session.value = "session-03";
      session.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
    sessionId,
  );
  await click('[data-testid="button-submit-track"]', devtools, sessionId);
  assert.equal(
    await devtools.evaluate(`Boolean(document.querySelector('[data-testid="form-submit-track"]'))`, sessionId),
    true,
    "Selecting a full session showed a submission receipt",
  );

  await devtools.evaluate(
    `(() => {
      const session = document.querySelector('[data-testid="select-session"]');
      session.value = "session-02";
      session.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
    sessionId,
  );
  await click('[data-testid="button-submit-track"]', devtools, sessionId);
  await waitFor("submission receipt", () =>
    devtools.evaluate(
      `document.querySelector('main h1')?.textContent.includes("Vous êtes dans la salle.")`,
      sessionId,
    ),
  );
  const receipt = await devtools.evaluate(
    `(() => ({
      title: document.querySelector('main h1')?.textContent.trim(),
      details: document.querySelector('main').innerText,
    }))()`,
    sessionId,
  );
  assert.ok(receipt.title.includes("Vous êtes dans la salle."), "Submission receipt is not localized in French");
  assert.ok(receipt.details.includes("#5"), "Submission receipt has no queue number");
  assert.ok(receipt.details.includes("En attente"), "Submission receipt has no translated pending status");
}

async function testHostQueue(devtools, sessionId) {
  await navigateTo("host", devtools, sessionId, testBaseUrl);
  const alternateSession = await devtools.evaluate(
    `(() => {
      const selector = document.querySelector('[data-testid="select-admin-session"]');
      selector.value = "session-02";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        selected: selector.value,
        rows: document.querySelectorAll('[data-testid^="row-admin-submission-"]').length,
      };
    })()`,
    sessionId,
  );
  assert.equal(alternateSession.selected, "session-02", "Host session selection did not change");
  assert.equal(alternateSession.rows, 2, "The selected host session did not load its queue");

  await devtools.evaluate(
    `(() => {
      const selector = document.querySelector('[data-testid="select-admin-session"]');
      selector.value = "session-01";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
    sessionId,
  );
  await waitFor("first host queue", () =>
    devtools.evaluate(
      `Boolean(document.querySelector('[data-testid="row-admin-submission-submission-03"]'))`,
      sessionId,
    ),
  );
  await waitFor("pending host queue controls", () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="row-admin-submission-submission-03"]')?.textContent.includes("Approve")`,
      sessionId,
    ),
  );

  await clickButtonByText("Approve", devtools, sessionId, '[data-testid="row-admin-submission-submission-03"]');
  await waitFor("approved submission status", () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="row-admin-submission-submission-03"] h3')?.parentElement?.querySelector('span')?.textContent.trim() === "Approved"`,
      sessionId,
    ),
  );
  await clickButtonByText(
    "Mark played",
    devtools,
    sessionId,
    '[data-testid="row-admin-submission-submission-03"]',
  );
  await waitFor("played submission status", () =>
    devtools.evaluate(
      `document.querySelector('[data-testid="row-admin-submission-submission-03"] h3')?.parentElement?.querySelector('span')?.textContent.trim() === "Played"`,
      sessionId,
    ),
  );
  await clickButtonByText("Skip", devtools, sessionId, '[data-testid="row-admin-submission-submission-04"]');
  const skipped = await devtools.evaluate(
    `document.querySelector('[data-testid="row-admin-submission-submission-04"] h3')?.parentElement?.querySelector('span')?.textContent.trim()`,
    sessionId,
  );
  assert.equal(skipped, "Skipped", "Host could not skip an approved queue item");

  await navigateTo("host", devtools, sessionId, testBaseUrl);
  await clickButtonByText(
    "Reject",
    devtools,
    sessionId,
    '[data-testid="row-admin-submission-submission-03"]',
  );
  const rejected = await devtools.evaluate(
    `document.querySelector('[data-testid="row-admin-submission-submission-03"] h3')?.parentElement?.querySelector('span')?.textContent.trim()`,
    sessionId,
  );
  assert.equal(rejected, "Rejected", "Host could not reject a pending queue item");
}

async function testLiveQueue(devtools, sessionId) {
  await navigateTo("live", devtools, sessionId, testBaseUrl);
  const initialArtist = await devtools.evaluate(
    `document.querySelector('main .glass-panel h2')?.textContent.trim()`,
    sessionId,
  );
  assert.equal(initialArtist, "The Quiet Hours", "LIVE did not start with the first approved track");

  await click('[aria-label="Play"]', devtools, sessionId);
  await waitFor("LIVE playback to start", () =>
    devtools.evaluate(`Boolean(document.querySelector('[aria-label="Pause"]'))`, sessionId),
  );
  await click('[aria-label="Pause"]', devtools, sessionId);
  await waitFor("LIVE playback to pause", () =>
    devtools.evaluate(`Boolean(document.querySelector('[aria-label="Play"]'))`, sessionId),
  );
  await clickButtonByText("Next", devtools, sessionId);
  await waitFor("next LIVE track", () =>
    devtools.evaluate(
      `document.querySelector('main .glass-panel h2')?.textContent.trim() === "Mara Voss"`,
      sessionId,
    ),
  );
  assert.ok(
    await devtools.evaluate(`Boolean(document.querySelector('[aria-label="Play"]'))`, sessionId),
    "Advancing the LIVE queue did not reset playback",
  );
  await clickButtonByText("Mark played", devtools, sessionId);
  await waitFor("following LIVE track", () =>
    devtools.evaluate(
      `document.querySelector('main .glass-panel h2')?.textContent.trim() === "Ash & Ember"`,
      sessionId,
    ),
  );
  await clickButtonByText("Next", devtools, sessionId);
  await waitFor("empty LIVE queue", () =>
    devtools.evaluate(
      `document.querySelector('main .glass-panel h2')?.textContent.trim() === "The queue is quiet."`,
      sessionId,
    ),
  );
}

let testBaseUrl;

async function main() {
  const chromium = findChromium();
  const port = await getFreePort();
  testBaseUrl = `http://127.0.0.1:${port}`;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gofl-desktop-interactions-"));
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
        return (await fetch(`${testBaseUrl}/preview/gofl-current/CurrentSessions`)).ok;
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
    }, 60000);
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

    await navigateTo("sessions", devtools, sessionId, testBaseUrl);
    for (const width of viewportWidths) {
      await devtools.send(
        "Emulation.setDeviceMetricsOverride",
        { width, height: 1000, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );

      for (const language of languages) {
        await navigateTo("sessions", devtools, sessionId, testBaseUrl);
        await selectLanguage(language, devtools, sessionId);
        await assertLanguage(language, "sessions", devtools, sessionId);

        if (language.code === "en") {
          await click('[data-testid="card-session-session-01"] button', devtools, sessionId);
          const selection = await devtools.evaluate(
            `document.querySelector('[role="status"]')?.innerText.trim()`,
            sessionId,
          );
          assert.ok(selection.includes("Selected"), "Joining a session did not show its selected state");
          assert.ok(selection.includes("Artist spotlight"), "The selected session was not identified");
        }

        for (const kind of ["submit", "host", "live"]) {
          await navigateTo(kind, devtools, sessionId, testBaseUrl);
          await assertLanguage(language, kind, devtools, sessionId);
          await checkLayout(kind, width, devtools, sessionId);
        }
        await navigateTo("sessions", devtools, sessionId, testBaseUrl);
        await checkLayout("sessions", width, devtools, sessionId);
        console.log(`PASS ${language.code.toUpperCase()} language persistence and ${width}px desktop-preview layouts`);
      }

      await navigateTo("sessions", devtools, sessionId, testBaseUrl);
      await selectLanguage(languages[1], devtools, sessionId);
      await testSubmissionReceipt(devtools, sessionId);
      await checkLayout("submit receipt", width, devtools, sessionId);
      console.log(`PASS submission receipt at ${width}px`);
    }

    await devtools.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await navigateTo("sessions", devtools, sessionId, testBaseUrl);
    await selectLanguage(languages[0], devtools, sessionId);
    await testHostQueue(devtools, sessionId);
    console.log("PASS host session selection, approval, played, and skipped queue statuses");
    await testLiveQueue(devtools, sessionId);
    console.log("PASS LIVE playback controls and queue advancement through the empty state");

    assert.deepEqual(
      devtools.runtimeErrors,
      [],
      `Browser runtime errors:\n${devtools.runtimeErrors.join("\n")}`,
    );
    console.log("All desktop Gathering of the Fallen browser checks passed.");
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
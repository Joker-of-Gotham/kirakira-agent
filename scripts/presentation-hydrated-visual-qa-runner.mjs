#!/usr/bin/env node
import { app, BrowserWindow } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readPayload() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("presentation hydrated visual QA runner requires a payload path");
  }
  return JSON.parse(readFileSync(resolve(payloadPath), "utf8"));
}

function normalizeConsoleMessage(args) {
  const [first, second, third, fourth] = args;
  if (first && typeof first === "object" && !Array.isArray(first) && "message" in first) {
    return {
      level: String(first.level ?? "unknown"),
      message: String(first.message ?? ""),
      line: Number(first.lineNumber ?? 0),
      source: String(first.sourceId ?? ""),
    };
  }
  return {
    level: String(first ?? "unknown"),
    message: String(second ?? ""),
    line: Number(third ?? 0),
    source: String(fourth ?? ""),
  };
}

function consoleMessageIsError(message) {
  const level = String(message.level).toLowerCase();
  if (
    String(message.message).includes("Electron Security Warning (Insecure Content-Security-Policy)") &&
    String(message.source).startsWith("node:electron")
  ) {
    return false;
  }
  return level === "2" || level === "3" || level.includes("error");
}

function screenshotQuality(image, png) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const stride = Math.max(4, Math.floor(bitmap.length / 512));
  const colors = new Set();
  let alphaPixels = 0;
  for (let index = 0; index < bitmap.length; index += stride) {
    const r = bitmap[index] ?? 0;
    const g = bitmap[index + 1] ?? 0;
    const b = bitmap[index + 2] ?? 0;
    const a = bitmap[index + 3] ?? 255;
    if (a > 0) alphaPixels += 1;
    colors.add(`${r},${g},${b},${a}`);
  }
  return {
    width: size.width,
    height: size.height,
    pngBytes: png.length,
    sampledColors: colors.size,
    alphaPixels,
    nonblank: size.width > 0 && size.height > 0 && png.length > 2048 && colors.size >= 8,
  };
}

function probeScript(config) {
  const payload = JSON.stringify(config);
  return `async () => {
    const config = ${payload};
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cssPath = (node) => {
      if (!node || !node.tagName) return "unknown";
      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const id = current.id ? "#" + current.id : "";
        const klass = typeof current.className === "string" && current.className.trim()
          ? "." + current.className.trim().split(/\\s+/u).slice(0, 2).join(".")
          : "";
        parts.unshift(tag + id + klass);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const visibleElement = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";
    };
    const setNativeInputValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) {
        input.value = value;
      } else {
        setter.call(input, value);
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const dispatchKey = (target, init) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const overflow = {
      documentHorizontalPixels: Math.max(
        0,
        document.documentElement.scrollWidth - window.innerWidth,
        document.body?.scrollWidth - window.innerWidth,
      ),
      clippedText: [],
    };
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (!visibleElement(element)) continue;
      const style = getComputedStyle(element);
      const intentional = /^(auto|scroll|hidden|clip)$/u.test(style.overflowX);
      const ellipsis = style.textOverflow === "ellipsis";
      if (element.scrollWidth > element.clientWidth + 2 && !intentional && !ellipsis) {
        overflow.clippedText.push({
          selector: cssPath(element),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          text: (element.textContent ?? "").replace(/\\s+/gu, " ").trim().slice(0, 96),
        });
      }
      if (overflow.clippedText.length >= 10) break;
    }
    const commandTrigger = document.querySelector('button[aria-label="Open command palette"]');
    const commandPalette = {
      triggerFound: Boolean(commandTrigger),
      shortcutDefaultPrevented: false,
      openedByShortcut: false,
      searchFocused: false,
      optionCount: 0,
      filteredSystemsActionFound: false,
      executedSystemsView: false,
      reopenedByTrigger: false,
      closedByEscape: false,
    };
    commandPalette.shortcutDefaultPrevented = dispatchKey(window, {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
    });
    await waitFrame();
    let commandDialog = document.querySelector('[data-kk-command-palette="open"]');
    commandPalette.openedByShortcut = Boolean(commandDialog);
    const searchInput = document.querySelector('input[aria-label="Search workbench commands"]');
    commandPalette.searchFocused = document.activeElement === searchInput;
    commandPalette.optionCount = document.querySelectorAll("[data-kk-command-action-kind]").length;
    if (searchInput instanceof HTMLInputElement) {
      setNativeInputValue(searchInput, "systems");
      await waitFrame();
      commandPalette.filteredSystemsActionFound = Boolean(
        document.querySelector('[data-kk-command-action-id="view.systems"]'),
      );
      dispatchKey(searchInput, { key: "Enter", code: "Enter" });
      await waitFrame();
      const shellAfterEnter = document.querySelector("main.kk-shell");
      commandPalette.executedSystemsView =
        shellAfterEnter?.getAttribute("data-kk-workbench-view") === "workbench-view-systems";
    }
    if (commandTrigger instanceof HTMLElement) {
      commandTrigger.click();
      await waitFrame();
      commandDialog = document.querySelector('[data-kk-command-palette="open"]');
      commandPalette.reopenedByTrigger = Boolean(commandDialog);
      if (commandDialog instanceof HTMLElement) {
        dispatchKey(commandDialog, { key: "Escape", code: "Escape" });
        await waitFrame();
        commandPalette.closedByEscape = !document.querySelector('[data-kk-command-palette="open"]');
      }
    }
    const views = [];
    for (const view of config.views) {
      const navButton = document.querySelector(
        'nav[aria-label="Workspace views"] button[aria-label="' + view.navAriaLabel + '"]',
      );
      if (navButton instanceof HTMLElement) {
        navButton.click();
        await waitFrame();
      }
      const workspace = document.querySelector('section[aria-label="' + view.workspaceAriaLabel + '"]');
      const active = document.querySelector('section[data-kk-workbench-view="' + view.selector + '"]');
      const currentButtons = document.querySelectorAll(
        'nav[aria-label="Workspace views"] button[aria-current="page"]',
      );
      const shell = document.querySelector("main.kk-shell");
      views.push({
        id: view.id,
        selector: view.selector,
        navFound: Boolean(navButton),
        workspaceFound: Boolean(workspace),
        activeFound: Boolean(active),
        shellActive: shell?.getAttribute("data-kk-workbench-view") === view.selector,
        currentNavCount: currentButtons.length,
        textLength: (workspace?.textContent ?? active?.textContent ?? "").replace(/\\s+/gu, " ").trim().length,
      });
    }
    await waitFrame();
    const shell = document.querySelector("main.kk-shell");
    const surface = shell?.getAttribute("data-kk-presentation-surface")
      ?? document.querySelector("[data-kk-presentation-surface]")?.getAttribute("data-kk-presentation-surface");
    return {
      readyState: document.readyState,
      title: document.title,
      rootChildCount: document.getElementById("root")?.childElementCount ?? 0,
      bodyTextLength: (document.body?.innerText ?? "").replace(/\\s+/gu, " ").trim().length,
      shellFound: Boolean(shell),
      surface,
      views,
      commandPalette,
      overflow,
      activeElement: document.activeElement ? cssPath(document.activeElement) : null,
    };
  }`;
}

function probeFailures(probe, expectedSurface) {
  const failures = [];
  if (!["interactive", "complete"].includes(probe.readyState)) {
    failures.push(`document readiness is ${probe.readyState}`);
  }
  if (probe.rootChildCount < 1) failures.push("#root has no mounted renderer children");
  if (probe.bodyTextLength < 250) failures.push(`body text is too small (${probe.bodyTextLength})`);
  if (!probe.shellFound) failures.push("missing main.kk-shell");
  if (probe.surface !== expectedSurface) {
    failures.push(`presentation surface is ${probe.surface ?? "missing"}, expected ${expectedSurface}`);
  }
  for (const view of probe.views ?? []) {
    if (!view.navFound) failures.push(`missing nav button for ${view.id}`);
    if (!view.workspaceFound) failures.push(`missing workspace for ${view.id}`);
    if (!view.activeFound) failures.push(`missing active view marker for ${view.id}`);
    if (!view.shellActive) failures.push(`shell did not activate ${view.id}`);
    if (view.currentNavCount !== 1) failures.push(`expected one current nav item for ${view.id}, saw ${view.currentNavCount}`);
    if (view.textLength < 40) failures.push(`workspace ${view.id} rendered too little text`);
  }
  const commandPalette = probe.commandPalette ?? {};
  if (!commandPalette.triggerFound) failures.push("missing command palette trigger");
  if (!commandPalette.shortcutDefaultPrevented) failures.push("command palette shortcut was not handled");
  if (!commandPalette.openedByShortcut) failures.push("command palette did not open from shortcut");
  if (!commandPalette.searchFocused) failures.push("command palette search did not receive focus");
  if ((commandPalette.optionCount ?? 0) < 3) {
    failures.push(`command palette rendered too few actions (${commandPalette.optionCount ?? 0})`);
  }
  if (!commandPalette.filteredSystemsActionFound) {
    failures.push("command palette search did not find Systems view action");
  }
  if (!commandPalette.executedSystemsView) {
    failures.push("command palette Enter did not activate Systems view");
  }
  if (!commandPalette.reopenedByTrigger) failures.push("command palette trigger did not reopen palette");
  if (!commandPalette.closedByEscape) failures.push("command palette did not close on Escape");
  if ((probe.overflow?.documentHorizontalPixels ?? 0) > 2) {
    failures.push(`document has horizontal overflow ${probe.overflow.documentHorizontalPixels}px`);
  }
  if ((probe.overflow?.clippedText ?? []).length > 0) {
    const detail = probe.overflow.clippedText
      .map((item) => `${item.selector} ${item.clientWidth}/${item.scrollWidth} ${JSON.stringify(item.text)}`)
      .join("; ");
    failures.push(`found ${probe.overflow.clippedText.length} unintentional clipped elements: ${detail}`);
  }
  return failures;
}

async function loadSurfaceViewport(surface, viewport, payload) {
  const consoleMessages = [];
  const pageFailures = [];
  const window = new BrowserWindow({
    show: false,
    width: viewport.width,
    height: viewport.height,
    backgroundColor: "#f5f7f8",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      offscreen: true,
    },
  });
  window.webContents.on("console-message", (_event, ...args) => {
    consoleMessages.push(normalizeConsoleMessage(args));
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    pageFailures.push({
      kind: "did-fail-load",
      errorCode,
      errorDescription,
      url: validatedURL,
    });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    pageFailures.push({
      kind: "render-process-gone",
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  });

  try {
    await window.loadURL(surface.target);
    await window.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
    const probe = await window.webContents.executeJavaScript(
      `(${probeScript({ views: payload.views })})()`,
      true,
    );
    const image = await window.webContents.capturePage();
    const png = image.toPNG();
    const screenshotPath = resolve(
      payload.screenshotDir,
      `${surface.surface}-${viewport.id}.png`,
    );
    mkdirSync(dirname(screenshotPath), { recursive: true });
    writeFileSync(screenshotPath, png);
    const quality = screenshotQuality(image, png);
    const failures = [
      ...probeFailures(probe, surface.surface),
      ...(quality.nonblank ? [] : ["captured screenshot appears blank"]),
      ...pageFailures.map((failure) => `${failure.kind}: ${failure.errorDescription ?? failure.reason ?? failure.errorCode}`),
      ...consoleMessages.filter(consoleMessageIsError).map((message) => `console ${message.level}: ${message.message}`),
    ];
    return {
      viewport,
      status: failures.length === 0 ? "passed" : "failed",
      screenshotPath: screenshotPath.replaceAll("\\", "/"),
      screenshot: quality,
      consoleMessages,
      pageFailures,
      probe,
      failures,
    };
  } finally {
    window.close();
  }
}

async function run() {
  const payload = readPayload();
  await app.whenReady();
  const viewports = [];
  for (const viewport of payload.viewports) {
    viewports.push(await loadSurfaceViewport(payload.surface, viewport, payload));
  }
  const failures = viewports.flatMap((viewport) =>
    (viewport.failures ?? []).map((failure) => `${viewport.viewport.id}: ${failure}`),
  );
  const result = {
    schemaVersion: 1,
    surface: payload.surface.surface,
    target: payload.surface.target,
    status: failures.length === 0 ? "passed" : "failed",
    viewports,
    failures,
  };
  mkdirSync(dirname(resolve(payload.outputPath)), { recursive: true });
  writeFileSync(resolve(payload.outputPath), `${JSON.stringify(result, null, 2)}\n`);
  app.exit(failures.length === 0 ? 0 : 1);
}

run().catch((error) => {
  try {
    const payload = readPayload();
    mkdirSync(dirname(resolve(payload.outputPath)), { recursive: true });
    writeFileSync(
      resolve(payload.outputPath),
      `${JSON.stringify({
        schemaVersion: 1,
        status: "failed",
        failures: [error instanceof Error ? error.message : String(error)],
      }, null, 2)}\n`,
    );
  } catch {
    // Keep the original failure as the process result.
  }
  console.error(error instanceof Error ? error.message : String(error));
  app.exit(1);
});

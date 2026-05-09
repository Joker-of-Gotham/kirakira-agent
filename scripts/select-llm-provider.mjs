#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  LLM_PROVIDERS,
  chatCompletionsURL,
  detectProviders,
  getProvider,
  getProviderKey,
  listProviderModels,
} from "./llm-providers.mjs";

const args = parseArgs(process.argv.slice(2));
const envPath = resolve(process.cwd(), args.env ?? ".env");
const fileEnv = existsSync(envPath) ? parseEnv(await readFile(envPath, "utf8")) : {};
const env = { ...fileEnv, ...process.env };
const rl = createInterface({ input, output });

try {
  const provider = await resolveProvider();
  const apiKey = await resolveApiKey(provider);
  const discovery = await listProviderModels(provider, apiKey);

  if (discovery.source !== "live") {
    console.log(`Model discovery used the fallback list: ${discovery.detail}`);
  } else {
    console.log(`Detected models from ${discovery.detail}`);
  }

  const selectedModel = await chooseModel(discovery.models);
  const updates = {
    LLM_PROVIDER: provider.id,
    LLM_BASE_URL: provider.baseURL,
    LLM_CHAT_COMPLETIONS_URL: chatCompletionsURL(provider),
    LLM_MODEL: selectedModel,
  };

  if (apiKey) {
    updates[provider.keyEnv] = apiKey;
    updates.LLM_API_KEY = apiKey;
  }

  if (!args.noWrite) {
    await writeEnv(envPath, updates);
    console.log(`Updated ${envPath}`);
  }

  console.log(`Provider: ${provider.label}`);
  console.log(`Model: ${selectedModel}`);
  console.log(`Base URL: ${provider.baseURL}`);
} finally {
  rl.close();
}

async function resolveProvider() {
  const explicitProvider = getProvider(args.provider);
  if (explicitProvider) return explicitProvider;

  const configuredProvider = getProvider(env.LLM_PROVIDER);
  if (configuredProvider && env.LLM_PROVIDER !== "auto") return configuredProvider;

  const detected = detectProviders(env);
  if (detected.length === 1) return detected[0];

  const providers = detected.length > 1 ? detected : LLM_PROVIDERS;
  console.log("Select provider:");
  providers.forEach((provider, index) => {
    const keyState = getProviderKey(provider, env) ? "key found" : `${provider.keyEnv} not set`;
    console.log(`${index + 1}. ${provider.label} (${provider.id}, ${keyState})`);
  });

  const selectedIndex = await askIndex("Provider number", providers.length);
  return providers[selectedIndex];
}

async function resolveApiKey(provider) {
  const existing = getProviderKey(provider, env);
  if (existing) return existing;
  if (args.fallback || !input.isTTY) return "";

  const answer = await rl.question(`Paste ${provider.keyEnv} for live model detection, or press Enter for fallback list: `);
  return answer.trim();
}

async function chooseModel(models) {
  if (models.length === 0) {
    throw new Error("No models available for selection.");
  }

  if (args.modelIndex) {
    const selected = Number.parseInt(args.modelIndex, 10);
    if (!Number.isInteger(selected) || selected < 1 || selected > models.length) {
      throw new Error(`--model-index must be a number from 1 to ${models.length}.`);
    }
    console.log("Select model:");
    models.forEach((model, index) => console.log(`${index + 1}. ${model}`));
    return models[selected - 1];
  }

  let choices = models;
  if (models.length > 30) {
    const filter = (await rl.question(`Detected ${models.length} models. Type a filter, or press Enter to show the first 30: `))
      .trim()
      .toLowerCase();
    choices = filter ? models.filter((model) => model.toLowerCase().includes(filter)) : models.slice(0, 30);
    if (choices.length === 0) {
      throw new Error(`No models matched filter "${filter}".`);
    }
  }

  console.log("Select model:");
  choices.forEach((model, index) => console.log(`${index + 1}. ${model}`));
  const selectedIndex = await askIndex("Model number", choices.length);
  return choices[selectedIndex];
}

async function askIndex(prompt, max) {
  while (true) {
    const answer = (await rl.question(`${prompt} [1-${max}]: `)).trim();
    const selected = Number.parseInt(answer, 10);
    if (Number.isInteger(selected) && selected >= 1 && selected <= max) return selected - 1;
    console.log(`Enter a number from 1 to ${max}.`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") parsed.env = argv[++index];
    else if (arg === "--provider") parsed.provider = argv[++index];
    else if (arg === "--model-index") parsed.modelIndex = argv[++index];
    else if (arg === "--fallback") parsed.fallback = true;
    else if (arg === "--no-write") parsed.noWrite = true;
  }
  return parsed;
}

function parseEnv(content) {
  const parsed = {};
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match) continue;
    parsed[match[1]] = unquoteEnv(match[2].trim());
  }
  return parsed;
}

async function writeEnv(path, updates) {
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/u) : [];
  const seen = new Set();
  const outputLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/u);
    if (!match || !(match[2] in updates)) return line;
    seen.add(match[2]);
    return `${match[1]}${match[2]}${match[3]}${quoteEnv(updates[match[2]])}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) outputLines.push(`${key}=${quoteEnv(value)}`);
  }

  await writeFile(path, `${outputLines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function unquoteEnv(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteEnv(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:@+=-]+$/u.test(stringValue)) return stringValue;
  return JSON.stringify(stringValue);
}

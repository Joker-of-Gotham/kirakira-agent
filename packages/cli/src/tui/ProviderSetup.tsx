import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProviderConfig } from "../gateway/openai-complete.js";
import {
  LLM_PROVIDERS,
  chatCompletionsUrl,
  discoverProviderModels,
  isUsableApiKey,
} from "../gateway/provider-catalog.js";
import type { LlmProvider } from "../gateway/provider-catalog.js";
import type { TuiTheme } from "./theme.js";

interface ProviderSetupProps {
  workspaceRoot: string;
  theme: TuiTheme;
  onConfigured: (config: ProviderConfig, provider: LlmProvider) => void;
}

type SetupStep = "provider" | "key" | "model" | "saving";

export function ProviderSetup({
  workspaceRoot,
  theme,
  onConfigured,
}: ProviderSetupProps): React.ReactElement {
  const app = useApp();
  const [step, setStep] = useState<SetupStep>("provider");
  const [providerIndex, setProviderIndex] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelIndex, setModelIndex] = useState(0);
  const [modelFilter, setModelFilter] = useState("");
  const [status, setStatus] = useState("Choose a provider to configure this workspace.");

  const provider = LLM_PROVIDERS[providerIndex]!;
  const filteredModels = useMemo(() => {
    const filter = modelFilter.trim().toLowerCase();
    return filter
      ? models.filter((model) => model.toLowerCase().includes(filter))
      : models;
  }, [modelFilter, models]);

  const visibleStart = Math.max(0, Math.min(modelIndex - 5, Math.max(filteredModels.length - 10, 0)));
  const visibleModels = filteredModels.slice(visibleStart, visibleStart + 10);

  const loadModels = async (): Promise<void> => {
    if (!isUsableApiKey(apiKey)) {
      setStatus(`Paste ${provider.keyEnv} before continuing.`);
      return;
    }

    setStep("saving");
    setStatus(`Detecting models from ${provider.label}...`);
    const discovery = await discoverProviderModels(provider, apiKey);
    if (discovery.authFailed) {
      setStep("key");
      setStatus(`Key rejected by ${provider.label}: ${discovery.detail}`);
      return;
    }

    setModels(discovery.models);
    setModelIndex(0);
    setModelFilter("");
    setStep("model");
    setStatus(
      discovery.source === "live"
        ? `Detected ${discovery.models.length} models. Choose one to continue.`
        : `Model detection used fallback list: ${discovery.detail}`,
    );
  };

  const saveSelection = async (): Promise<void> => {
    const selectedModel = filteredModels[modelIndex];
    if (!selectedModel) {
      setStatus("Choose a model before saving.");
      return;
    }

    setStep("saving");
    setStatus("Saving model configuration...");
    const updates: Record<string, string> = {
      LLM_PROVIDER: provider.id,
      LLM_BASE_URL: provider.baseUrl,
      LLM_CHAT_COMPLETIONS_URL: chatCompletionsUrl(provider),
      LLM_MODEL: selectedModel,
      [provider.keyEnv]: apiKey,
      LLM_API_KEY: apiKey,
    };

    const envPath = resolve(workspaceRoot, ".env");
    await writeEnv(envPath, updates);
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    onConfigured({
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: selectedModel,
    }, provider);
  };

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      app.exit();
      return;
    }

    if (step === "saving") return;

    if (key.escape) {
      if (step === "model") {
        setStep("key");
        setStatus(`Paste ${provider.keyEnv} and press Enter.`);
      } else if (step === "key") {
        setStep("provider");
        setStatus("Choose a provider to configure this workspace.");
      }
      return;
    }

    if (step === "provider") {
      if (key.upArrow) {
        setProviderIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || key.tab) {
        setProviderIndex((prev) => Math.min(LLM_PROVIDERS.length - 1, prev + 1));
        return;
      }
      const numeric = Number.parseInt(input, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= LLM_PROVIDERS.length) {
        setProviderIndex(numeric - 1);
        setApiKey("");
        setStep("key");
        setStatus(`Paste ${LLM_PROVIDERS[numeric - 1]!.keyEnv} and press Enter.`);
        return;
      }
      if (key.return) {
        setApiKey("");
        setStep("key");
        setStatus(`Paste ${provider.keyEnv} and press Enter.`);
      }
      return;
    }

    if (step === "key") {
      if (key.backspace || key.delete) {
        setApiKey((prev) => prev.slice(0, -1));
        return;
      }
      if (key.ctrl && input.toLowerCase() === "u") {
        setApiKey("");
        return;
      }
      if (key.return) {
        void loadModels();
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setApiKey((prev) => prev + input);
      }
      return;
    }

    if (step === "model") {
      if (key.upArrow) {
        setModelIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || key.tab) {
        setModelIndex((prev) => Math.min(Math.max(filteredModels.length - 1, 0), prev + 1));
        return;
      }
      if (key.backspace || key.delete) {
        setModelFilter((prev) => prev.slice(0, -1));
        setModelIndex(0);
        return;
      }
      if (key.ctrl && input.toLowerCase() === "u") {
        setModelFilter("");
        setModelIndex(0);
        return;
      }
      const numeric = Number.parseInt(input, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= visibleModels.length) {
        setModelIndex(visibleStart + numeric - 1);
        return;
      }
      if (key.return) {
        void saveSelection();
        return;
      }
      if (!key.ctrl && !key.meta && input && !/^\d$/u.test(input)) {
        setModelFilter((prev) => prev + input);
        setModelIndex(0);
      }
    }
  });

  const cols = process.stdout.columns ?? 100;
  const panelWidth = Math.min(Math.max(cols - 10, 64), 96);
  const keyPreview = apiKey ? "*".repeat(Math.min(apiKey.length, 48)) : "";

  return (
    <Box flexDirection="column" width="100%" height="100%" backgroundColor={theme.colors.bg}>
      <Box paddingX={2} paddingY={1} backgroundColor={theme.colors.surfaceRaised} justifyContent="space-between">
        <Text color={theme.colors.fg} bold>kirakira-agent setup</Text>
        <Text color={theme.colors.textTertiary}>Esc back  Ctrl+C exit</Text>
      </Box>

      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Box width={panelWidth} flexDirection="column">
          <Text color={theme.colors.fg} bold>Configure LLM provider</Text>
          <Text color={theme.colors.textSecondary}>Keys stay in this workspace .env file. Base URLs are managed by Kirakira.</Text>
          <Box marginTop={1}>
            <Text color={theme.colors.info}>{status}</Text>
          </Box>

          <Box marginTop={2} flexDirection="column">
            <Text color={step === "provider" ? theme.colors.brand : theme.colors.textSecondary} bold>
              1. Provider
            </Text>
            {LLM_PROVIDERS.map((item, index) => {
              const active = index === providerIndex;
              return (
                <Text key={item.id} color={active ? theme.colors.fg : theme.colors.textTertiary} bold={active}>
                  {active ? "> " : "  "}{index + 1}. {item.label}  {item.baseUrl}
                </Text>
              );
            })}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={step === "key" ? theme.colors.brand : theme.colors.textSecondary} bold>
              2. API key
            </Text>
            <Text color={theme.colors.textTertiary}>{provider.keyEnv}</Text>
            <Box paddingX={1} backgroundColor={theme.colors.surfaceSunken}>
              <Text color={apiKey ? theme.colors.fg : theme.colors.textTertiary}>
                {keyPreview || "paste key here, then press Enter"}
              </Text>
            </Box>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={step === "model" ? theme.colors.brand : theme.colors.textSecondary} bold>
              3. Model
            </Text>
            {step === "model" && (
              <>
                <Text color={theme.colors.textTertiary}>
                  Type to filter{modelFilter ? `: ${modelFilter}` : ""}. Press Enter to save.
                </Text>
                {visibleModels.map((item, index) => {
                  const absoluteIndex = visibleStart + index;
                  const active = absoluteIndex === modelIndex;
                  return (
                    <Text key={`${item}-${index}`} color={active ? theme.colors.fg : theme.colors.textTertiary} bold={active}>
                      {active ? "> " : "  "}{index + 1}. {item}
                    </Text>
                  );
                })}
              </>
            )}
            {step !== "model" && (
              <Text color={theme.colors.textTertiary}>Model list appears after key validation.</Text>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

async function writeEnv(path: string, updates: Record<string, string>): Promise<void> {
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/u) : [];
  const seen = new Set<string>();

  const outputLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/u);
    const key = match?.[2];
    if (!match || !key || !(key in updates)) return line;
    seen.add(key);
    return `${match[1] ?? ""}${key}${match[3] ?? "="}${quoteEnv(updates[key]!)}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) outputLines.push(`${key}=${quoteEnv(value)}`);
  }

  await writeFile(path, `${outputLines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function quoteEnv(value: string): string {
  if (/^[A-Za-z0-9_./:@+=-]+$/u.test(value)) return value;
  return JSON.stringify(value);
}

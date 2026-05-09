/**
 * File change watcher for config hot-reload.
 *
 * Uses native fs.watch with debounce; emits events when agent.toml,
 * policy.yaml, or .kirakira/local.toml change on disk.
 */

import { existsSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PATHS, SYSTEM_CONFIG_PATH } from "@kirakira/core";

import type { ConfigChangeEvent, ConfigChangeHandler, ConfigLayerName } from "./types.js";

interface WatchTarget {
  layer: ConfigLayerName;
  path: string;
}

export class ConfigWatcher {
  private watchers: FSWatcher[] = [];
  private handlers: ConfigChangeHandler[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debounceMs: number;

  constructor(debounceMs = 500) {
    this.debounceMs = debounceMs;
  }

  onChange(handler: ConfigChangeHandler): void {
    this.handlers.push(handler);
  }

  start(workspaceRoot: string): void {
    this.stop();

    const home = homedir();
    const userConfigPath = join(home, PATHS.userHome, PATHS.userConfig);

    const targets: WatchTarget[] = [
      { layer: "repo", path: join(workspaceRoot, PATHS.workspaceConfig) },
      { layer: "repo", path: join(workspaceRoot, PATHS.workspacePolicy) },
      { layer: "workspace", path: join(workspaceRoot, PATHS.workspacePrivate) },
    ];

    if (existsSync(userConfigPath)) {
      targets.push({ layer: "user", path: userConfigPath });
    }
    if (existsSync(SYSTEM_CONFIG_PATH)) {
      targets.push({ layer: "system", path: SYSTEM_CONFIG_PATH });
    }

    for (const target of targets) {
      try {
        const w = watch(target.path, () => this.emitDebounced(target));
        this.watchers.push(w);
      } catch {
        // file may not exist yet
      }
    }
  }

  stop(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private emitDebounced(target: WatchTarget): void {
    const existing = this.debounceTimers.get(target.path);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      target.path,
      setTimeout(() => {
        this.debounceTimers.delete(target.path);
        const event: ConfigChangeEvent = {
          layer: target.layer,
          path: target.path,
          timestamp: Date.now(),
        };
        for (const handler of this.handlers) {
          handler(event);
        }
      }, this.debounceMs),
    );
  }
}

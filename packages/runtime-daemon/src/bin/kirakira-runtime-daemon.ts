#!/usr/bin/env node
import {
  DaemonLifecycle,
  registerShutdownHandlers,
} from "../index.js";
import { daemonConfigFromEnv } from "./daemon-config.js";

const daemon = new DaemonLifecycle();
registerShutdownHandlers(daemon);

await daemon.start(daemonConfigFromEnv(process.env));

const health = await daemon.health();
process.stdout.write(`${JSON.stringify({ ready: true, health })}\n`);

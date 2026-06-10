export const KIRAKIRA_PRELOAD_API_KEY = "kirakiraRuntime" as const;

export const RUNTIME_IPC_CHANNELS = {
  connect: "runtime:connect",
  disconnect: "runtime:disconnect",
  getStatus: "runtime:getStatus",
  submitPrompt: "runtime:submitPrompt",
  getState: "runtime:getState",
  getArtifactContent: "runtime:getArtifactContent",
  listMcpTools: "runtime:listMcpTools",
  callMcpTool: "runtime:callMcpTool",
  subscribeRun: "runtime:subscribeRun",
  unsubscribeRun: "runtime:unsubscribeRun",
  steer: "runtime:steer",
  enqueue: "runtime:enqueue",
  approve: "runtime:approve",
  provideInput: "runtime:provideInput",
  resume: "runtime:resume",
  inspect: "runtime:inspect",
  cancel: "runtime:cancel",
  drain: "runtime:drain",
} as const;

export const DESKTOP_COMMAND_CHANNELS = {
  openCommandPalette: "desktop-command:open-command-palette",
} as const;

export const KIRAKIRA_PRELOAD_API_METHODS = [
  "connect",
  "disconnect",
  "getStatus",
  "submitPrompt",
  "getState",
  "getArtifactContent",
  "listMcpTools",
  "callMcpTool",
  "subscribeRun",
  "steer",
  "enqueue",
  "approve",
  "provideInput",
  "resume",
  "inspect",
  "cancel",
  "drain",
  "onOpenCommandPalette",
] as const;

export type RuntimeIpcChannelName = keyof typeof RUNTIME_IPC_CHANNELS;
export type RuntimeIpcChannel = (typeof RUNTIME_IPC_CHANNELS)[RuntimeIpcChannelName];
export type DesktopCommandChannelName = keyof typeof DESKTOP_COMMAND_CHANNELS;
export type DesktopCommandChannel = (typeof DESKTOP_COMMAND_CHANNELS)[DesktopCommandChannelName];
export type KirakiraPreloadApiMethod = (typeof KIRAKIRA_PRELOAD_API_METHODS)[number];

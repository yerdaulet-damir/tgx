// Public surface. The fluent builder is the headline; everything compiles to one
// engine underneath.
//   screen("name")...   — fluent builder (canonical, full customization)
//   flow()              — linear wizard (sugar over the engine)
//   defineScreen()      — low-level object form (advanced / used internally)
export { screen, Builder } from "./builder.js";
export type { Ctx as ScreenHandlerCtx } from "./builder.js";
export { defineScreen, run, Engine, fileAnalytics, normalizeFile, requireChannel, broadcast } from "./screen.js";
export type {
  View,
  Btn,
  ScreenCtx,
  ScreenDef,
  ScreenReg,
  InputMsg,
  IncomingFile,
  MenuButton,
  Gate,
  BroadcastResult,
  NavSession,
  Ctx,
  RunOptions,
} from "./screen.js";
export { flow, ask, choose, payStars } from "./flow.js";
export type { Step, FlowConfig } from "./flow.js";
export { validate, formatIssues } from "./validate.js";
export type { ValidationIssue } from "./validate.js";
export type { ScreenMeta } from "./screen.js";
export { runStream } from "./stream.js";
export type { StreamChunk, StreamOptions, StreamResult, StreamIO } from "./stream.js";
export { graph, mermaid } from "./graph.js";
export type { GraphOptions } from "./graph.js";
export type { ControlMeta } from "./screen.js";
export { fileStorage } from "./storage.js";

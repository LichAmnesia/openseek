// Plugin protocol — third-party packages extending @openseek/tool & /command.
// SPEC.md milestone v0.4 G4.4.
//
// We type the surface in plugin-land instead of importing from @openseek/tool
// or @openseek/command to keep the protocol package leaf-shaped (so a plugin
// can `peerDependency` it without pulling the whole tree).

export interface PluginToolLike {
  name: string;
  description?: string;
  // Plugins are free to attach more fields; the host validates by shape.
  [key: string]: unknown;
}

export interface PluginCommandLike {
  name: string;
  description?: string;
  category?: string;
  isStub?: boolean;
  handle: (...args: unknown[]) => unknown;
  [key: string]: unknown;
}

export interface PluginApi {
  /** Register a tool. The host inspects `name` and adds it to the registry. */
  addTool: (tool: PluginToolLike) => void;
  /** Register a slash command. */
  addCommand: (cmd: PluginCommandLike) => void;
  /** Plugin-side logger for debug breadcrumbs. */
  log?: (msg: string, meta?: unknown) => void;
}

export interface Plugin {
  name: string;
  version: string;
  /** Author may use any side-effect on `api` to register. Sync or async. */
  register: (api: PluginApi) => void | Promise<void>;
}

export interface LoadResult {
  plugins: Plugin[];
  tools: PluginToolLike[];
  commands: PluginCommandLike[];
  warnings: Array<{ source: string; message: string }>;
}

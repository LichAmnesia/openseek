import type { AnyTool } from "./types.ts";

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  list(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  clear(): void {
    this.tools.clear();
  }

  size(): number {
    return this.tools.size;
  }

  /** Snapshot as a plain Map (consumers like @openseek/session expect Map). */
  toMap(): Map<string, AnyTool> {
    return new Map(this.tools);
  }
}

export function createRegistry(initial: AnyTool[] = []): ToolRegistry {
  const reg = new ToolRegistry();
  for (const tool of initial) reg.register(tool);
  return reg;
}

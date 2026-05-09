import type { Command, CommandCategory } from "./types.ts";

export class CommandRegistry {
  private cmds = new Map<string, Command>();

  register(cmd: Command): void {
    if (this.cmds.has(cmd.name)) {
      throw new Error(`command already registered: ${cmd.name}`);
    }
    this.cmds.set(cmd.name, cmd);
  }

  get(name: string): Command | undefined {
    return this.cmds.get(name);
  }

  has(name: string): boolean {
    return this.cmds.has(name);
  }

  list(): Command[] {
    return Array.from(this.cmds.values());
  }

  byCategory(cat: CommandCategory): Command[] {
    return this.list().filter((c) => c.category === cat);
  }

  size(): number {
    return this.cmds.size;
  }

  names(): string[] {
    return Array.from(this.cmds.keys());
  }
}

export function createRegistry(initial: Command[] = []): CommandRegistry {
  const reg = new CommandRegistry();
  for (const cmd of initial) reg.register(cmd);
  return reg;
}

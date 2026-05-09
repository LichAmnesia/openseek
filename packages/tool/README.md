# @openseek/tool

52 built-in tools (read/edit/bash/agent_spawn/task_*/mcp/skill/rlm_query/...)
## Layer rule

This package may import from:
- packages/core (always allowed)
- (other packages: see ARCHITECTURE.md)

This package may NOT import from:
- packages/cli, packages/tui (they are upstream)

## Tests

```bash
bun test packages/tool
```

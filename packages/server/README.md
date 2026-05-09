# @openseek/server

HTTP/SSE headless API (Hono + Bun adapter)
## Layer rule

This package may import from:
- packages/core (always allowed)
- (other packages: see ARCHITECTURE.md)

This package may NOT import from:
- packages/cli, packages/tui (they are upstream)

## Tests

```bash
bun test packages/server
```

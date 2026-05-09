# @openseek/lsp

LSP client (rust-analyzer/pyright/tsserver/gopls/clangd)
## Layer rule

This package may import from:
- packages/core (always allowed)
- (other packages: see ARCHITECTURE.md)

This package may NOT import from:
- packages/cli, packages/tui (they are upstream)

## Tests

```bash
bun test packages/lsp
```

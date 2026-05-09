{
  # OpenSeek Nix flake stub (G7.5).
  #
  # Full Nix support lands in v1.1; this file documents the intended
  # derivation shape so contributors can iterate offline. Imports the
  # latest pinned bun + builds via `bun build` then wraps the resulting
  # `dist/index.js` with a tiny shell script.

  description = "OpenSeek — TUI coding agent (Bun monorepo)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "openseek";
          version = "1.0.0";
          src = ../.;
          nativeBuildInputs = [ pkgs.bun ];
          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile
            bun run build
          '';
          installPhase = ''
            mkdir -p $out/bin $out/share/openseek
            cp -r dist node_modules $out/share/openseek/
            cat > $out/bin/openseek <<'SH'
            #!/bin/sh
            exec ${pkgs.bun}/bin/bun "$out/share/openseek/dist/index.js" "$@"
            SH
            chmod +x $out/bin/openseek
          '';
          meta = with pkgs.lib; {
            description = "Open-source TUI coding agent";
            homepage = "https://openseek.dev";
            license = licenses.mit;
            platforms = platforms.unix;
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.bun pkgs.nodejs_20 ];
        };
      });
}

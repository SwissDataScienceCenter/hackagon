{
  self,
  lib,
  ...
}:
let
  fs = lib.fileset;
  rootDir = ../../../..;
  rootFileset = fs.gitTracked rootDir;

  # The commit this flake was evaluated from. `nix build ./tools/nix#...`
  # resolves to `git+file://<repo>?dir=tools/nix`, so Nix already knows the
  # revision — no impurity, no env var, no CI hand-off needed.
  #
  # `rev` exists only for a clean tree; a dirty one carries `dirtyRev` instead
  # (same hash with a `-dirty` suffix). Neither exists if the flake is ever
  # evaluated from a plain path, hence the final null.
  rev = self.rev or self.dirtyRev or null;
in
{
  perSystem =
    { pkgs, ... }:
    let
      buildSystem = pkgs.stdenv.buildPlatform.system;
    in
    {
      # The hackagon library with root fileset and components.
      hackagon.lib = self.lib.mkExtendedLib {
        inherit
          buildSystem
          rootDir
          rootFileset
          rev
          ;
      };
    };
}

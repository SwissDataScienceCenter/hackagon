{ lib, ... }:
{
  perSystem =
    { pkgs, ... }:
    {
      # The bootstrap packages with all tools
      # to install over `nix profile install` before
      # using `nix develop` which is the primary
      # thing used here.
      hackagon.pkgs = {
        bootstrap = pkgs.buildEnv {
          name = "bootstrap";
          paths = [
            (lib.hiPrio pkgs.git)
            pkgs.git-lfs
            pkgs.bash

            pkgs.coreutils
            pkgs.findutils
            pkgs.direnv # Auto apply stuff on entering directory `cd`.
            pkgs.just # Command executor like `make` but better.
          ];
        };
      };
    };
}

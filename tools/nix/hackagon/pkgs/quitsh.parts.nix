{ ... }:
{
  perSystem =
    {
      config,
      pkgs,
      ...
    }:
    let
      cnLib = config.hackagon.lib;

      # The tool which acts as a helper to build stuff.
      quitsh = pkgs.callPackage ../../../quitsh/tools/nix/package {
        self = quitsh;
        inherit cnLib;
      };
    in
    {
      hackagon.pkgs = { inherit quitsh; };
    };
}

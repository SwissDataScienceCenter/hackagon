# Define different shells.
{
  lib,
  inputs,
  ...
}:
let
in
{
  perSystem =
    { config, pkgs, ... }:
    let
      cn = config.hackagon;

      # Add all hackagon package.
      pkgsEx = pkgs // {
        hackagon = cn.pkgs;
      };

      devenvs = cn.lib.toolchain.createDevenvModules {
        pkgs = pkgsEx;
        pkgsPinned = cn.build.pinned;
      };

      shells = lib.attrsets.mapAttrs (
        name: modules:
        cn.lib.shell.mkShell {
          pkgs = pkgsEx;
          inherit
            modules
            inputs
            ;
          inherit (pkgs) system;
        }
      ) devenvs;
    in
    {
      hackagon = { inherit shells; };
    };
}

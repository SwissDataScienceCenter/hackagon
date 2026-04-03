{
  self,
  lib,
  ...
}:
let
  fs = lib.fileset;
  rootDir = ../../../..;
  rootFileset = fs.gitTracked rootDir;
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
        inherit buildSystem rootDir rootFileset;
      };
    };
}

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
      # The custodian library with root fileset and components.
      custodian.lib = self.lib.mkExtendedLib {
        inherit buildSystem rootDir rootFileset;
      };
    };
}

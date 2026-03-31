{
  self,
  inputs,
  lib,
  ...
}:
let
  # Lib import.
  nixpkgs = import ./nixpkgs.nix { inherit self inputs; };

  # Libs which do not depend on anything but only lib.
  # ================================================
  common = {
    attrset = import ./attrset.nix { inherit lib; };
  };
  build = import ./build { };
  toolchain = import ./toolchain.nix { };
  shell = (import ./shell.nix) {
    inherit inputs lib;
  };

  # Make the full custodian library,
  # by instantiating it with `rootDir` and `rootFileset`.
  mkExtendedLib =
    {
      rootDir,
      rootFileset,
      buildSystem,
    }:
    let
      commonEx = common // {
        yaml = import ./yaml.nix {
          inherit (inputs) nixpkgs;
          inherit buildSystem;
        };
      };

      # The libraries only belonging to this flake,
      # since `rootDir` is baked.
      component = (import ./component) {
        inherit lib rootDir;
        libCommon = commonEx;
      };
      fileset = (import ./fileset.nix) {
        inherit
          lib
          rootDir
          rootFileset
          ;
        libComponent = component;
      };
    in
    {
      # Redefine common libs.
      inherit
        nixpkgs
        shell
        toolchain
        build
        ;
      common = commonEx;

      inherit component fileset;
    };

in
{
  flake.lib = {
    inherit
      mkExtendedLib
      nixpkgs
      common
      shell
      build
      toolchain
      ;
  };
}

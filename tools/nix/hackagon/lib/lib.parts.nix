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
  image = import ./image { inherit lib; };
  build = import ./build { };
  toolchain = import ./toolchain.nix { inherit lib; };
  shell = (import ./shell.nix) {
    inherit inputs lib;
  };

  # Make the full hackagon library,
  # by instantiating it with `rootDir` and `rootFileset`.
  mkExtendedLib =
    {
      rootDir,
      rootFileset,
      buildSystem,
      # The git revision the flake was evaluated from, or null when unknown.
      rev ? null,
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
        image
        toolchain
        build
        ;
      common = commonEx;

      inherit component fileset;

      # The full revision, and the short form the UI shows. Consumers must cope
      # with null: an image built from an unknown revision should say nothing
      # rather than claim a wrong one.
      inherit rev;
      shortRev = if rev == null then null else builtins.substring 0 7 rev;
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

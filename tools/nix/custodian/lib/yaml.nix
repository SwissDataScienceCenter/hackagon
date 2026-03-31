{ nixpkgs, buildSystem, ... }:
let
  lib = nixpkgs.lib;

  # Use here an instantiated pkgs set for the current system!
  # We execute it on the host!
  # This is Import-From-Derivation (IFD) which is not so nice!
  pkgs = nixpkgs.legacyPackages.${buildSystem};

  # Read a YAML file into a Nix datatype using IFD
  # (Import From Derivation).
  #
  # Similar to:
  # > builtins.fromJSON (builtins.readFile ./somefile)
  # but takes an input file in YAML instead of JSON.
  #
  # readYAML :: Path -> a
  #
  # where `a` is the Nixified version of the input file.
  read =
    path:
    let
      jsonOutputDrv = pkgs.runCommand "from-yaml" {
        nativeBuildInputs = [ pkgs.remarshal ];
      } "remarshal -if yaml -i \"${path}\" -of json -o \"$out\"";
    in
    builtins.fromJSON (builtins.readFile jsonOutputDrv);

  # The same as `read` but only reads some toplevel single-line attributes.
  # This is only to avoid (IFD)
  readSimple =
    path: keywords:
    let
      lines = lib.splitString "\n" (lib.readFile path);

      findKeyword =
        keyword:
        let
          res = builtins.match "${keyword}: (.*)" (lib.findFirst (l: lib.hasPrefix "${keyword}:" l) "" lines);
        in
        assert lib.assertMsg (res != null) "Keyword '${keyword}' not found!";
        builtins.elemAt res 0;
    in
    lib.foldl' lib.mergeAttrs { } (
      lib.map (k: {
        "${k}" = findKeyword k;
      }) keywords
    );
in
{
  inherit read readSimple;
}

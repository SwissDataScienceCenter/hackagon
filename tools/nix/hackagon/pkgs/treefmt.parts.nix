{ inputs, ... }:
{
  perSystem =
    { pkgs, ... }:
    let
      treefmtEval = inputs.treefmt-nix.lib.evalModule pkgs ./treefmt.nix;
      treefmt = treefmtEval.config.build.wrapper;
    in
    {
      hackagon.pkgs = {
        inherit treefmt;
      };
      formatter = treefmt;
    };
}

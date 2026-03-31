# Flake-Parts module which imports nixpkgs from
# `inputs.nixpkgs` and `inputs.nixpkgs-stable`
# It makes these packages available as
# `pkgs` and `pkgsStable` in each flake-parts module.
#
# There are two functions
# - `self.lib.importPkgs`
# - `self.lib.importPkgsUnstable`
# to import nixpkgs somewhere else.
{
  self,
  ...
}:
{
  perSystem =
    {
      system,
      ...
    }:
    let
      pkgs = self.lib.nixpkgs.pkgs { inherit system; };
      pkgsStable = self.lib.nixpkgs.pkgsStable { inherit system; };
    in
    {
      # All flake-parts modules now have two more arguments.
      _module.args.pkgs = pkgs;
      _module.args.pkgsStable = pkgsStable;

      legacyPackages.unstable = pkgs;
    };
}

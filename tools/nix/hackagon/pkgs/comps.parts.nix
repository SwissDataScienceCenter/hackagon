{ ... }:
{

  config = {
    perSystem =
      {
        config,
        pkgs,
        ...
      }:
      let
        cn = config.hackagon;

        # Add the build support stuff to the library.
        cnLib = cn.lib // {
          inherit (cn) build;
        };

        # Load all components packages by loading
        # `<compPath>/tools/nix/pkgs/default.nix` which must define a
        # an AttrSet of derivations.
        # The result is `{ compName : { pkg-a: derivation-a, pkgs-b: ...}, ...}`
        comp-packages = cnLib.component.loadPackages {
          inherit pkgs cnLib;
          inherit (cn.build) pinned;
        };
        comp-pkgs-flattened = cnLib.common.attrset.flattenDrvs comp-packages;
      in
      {
        # All hackagon components packages.
        hackagon = {
          components = {
            packages = comp-packages;
            packages-flat = comp-pkgs-flattened;
          };
        };
      };
  };
}

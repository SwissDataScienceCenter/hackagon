{
  flake-parts-lib,
  ...
}:
let
  inherit (flake-parts-lib) mkPerSystemOption;
in
{
  options.perSystem = mkPerSystemOption (
    {
      config,
      lib,
      ...
    }:
    let
      cn = config.custodian;
    in
    {
      options = {
        custodian = {
          lib = lib.mkOption {
            type = lib.types.lazyAttrsOf lib.types.raw;
            default = { };
          };
          build = lib.mkOption {
            type = lib.types.lazyAttrsOf lib.types.raw;
            default = { };
          };
          pkgs = lib.mkOption {
            type = lib.types.attrsOf lib.types.package;
            default = { };
          };
          components = {
            packages = lib.mkOption {
              type = lib.types.raw;
              default = { };
            };
            packages-flat = lib.mkOption {
              type = lib.types.attrsOf lib.types.package;
              default = [ ];
            };
          };
          shells = lib.mkOption {
            type = lib.types.attrsOf lib.types.package;
            default = { };
          };
        };
      };

      config = {
        # The whole custodian attribute set.
        # Note: in `legacyPackages` just for debugging.
        legacyPackages.custodian = cn;

        packages = {
          inherit (config.custodian) quitsh;
        }
        // cn.components.packages-flat
        // cn.pkgs;

        devShells = cn.shells;
      };
    }
  );
}

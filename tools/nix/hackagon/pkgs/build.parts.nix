{
  inputs,
  ...
}:
{
  perSystem =
    {
      config,
      system,
      pkgs,
      ...
    }:
    let
      cn = config.hackagon;

      codecov-cli =
        let
          pkgs = import inputs.nixpkgs-codecov {
            inherit system;
            config = {
              allowUnfree = true;
            };
          };
        in
        pkgs.codecov-cli;

      pkgsPinned = {
        go = pkgs.go_1_25;
        python = pkgs.python314;
        inherit codecov-cli;
        nodejs = pkgs.nodejs_22;
        pnpm = pkgs.pnpm_10.override { nodejs = pkgs.nodejs_22; };
      };
    in
    {
      hackagon = {
        build = {
          # All pinned packages.
          pinned = pkgsPinned;

          # Generate the Go build-support functions.
          buildGoModule = pkgs.callPackage cn.lib.build.createBuildGoModule {
            inherit (cn.pkgs) quitsh;
            inherit (pkgsPinned) go;
            libComponent = cn.lib.component;
          };

          # Generate the Node.js (pnpm) build-support function.
          buildNodePackage = pkgs.callPackage cn.lib.build.createBuildNodePackage {
            inherit (cn.pkgs) quitsh;
            inherit (pkgsPinned) nodejs pnpm;
            libComponent = cn.lib.component;
          };
        };
      };
    };
}

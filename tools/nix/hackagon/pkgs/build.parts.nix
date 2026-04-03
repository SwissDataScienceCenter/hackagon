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
        };
      };
    };
}

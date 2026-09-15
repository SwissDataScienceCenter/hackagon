{
  description = "hackagon";

  nixConfig = {
    extra-trusted-substituters = [
      # Nix community's cache server
      "https://nix-community.cachix.org"
      "https://devenv.cachix.org"
      "ssh://nix-ssh@nix-cache.swisscustodian.ch"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw="
      "nix-cache.swisscustodian.ch.1:rPQnp1nJav3UluO5MeomJTEPeqffeIu7Y41xpecBqMA="
    ];

    allow-import-from-derivation = "true";
  };

  inputs = {
    nixpkgs = {
      url = "github:nixos/nixpkgs/nixos-unstable";
    };

    # Pinned Versions ===================
    # - for codecov.
    # FIXME: https://github.com/getsentry/prevent-cli/issues/107
    # Last working version.
    nixpkgs-codecov.url = "github:nixos/nixpkgs";
    # ===================================

    # The devenv module to create good development shells.
    # The `nixpkgs-devenv` must aligned with the pinned version.
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs-devenv";
    };
    # This is the rolling nixpkgs with what devenv was tested.
    nixpkgs-devenv = {
      url = "github:cachix/devenv-nixpkgs";
    };
    devenv-root = {
      url = "file+file:///dev/null";
      flake = false;
    };

    # Format the repo with nix-treefmt.
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Quitsh functionality.
    quitsh = {
      url = "github:sdsc-ordes/quitsh?ref=main&dir=tools/nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Importing flake-parts modules recursively.
    import-tree = {
      url = "github:vic/import-tree";
    };

    flake-parts = {
      url = "github:hercules-ci/flake-parts";
    };

  };
  # We use flake-parts to assemble all flake outputs.
  # This gives nicer modularity. All `.parts` files are
  # `flake-parts` module files.
  outputs =
    inputs:
    let
      lib = inputs.nixpkgs.lib;
    in
    inputs.flake-parts.lib.mkFlake { inherit inputs; } (
      lib.pipe inputs.import-tree [
        # NOTE: Uncomment the below to inspect what modules are loaded.
        # (i: i.map (x: lib.info "Importing :${x}" x))
        (i: i.filter (lib.hasInfix ".parts."))
        (i: i ./.)
      ]
    );
}

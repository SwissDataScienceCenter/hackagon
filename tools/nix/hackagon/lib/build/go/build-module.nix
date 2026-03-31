# Taken from reference: `Nixpkgs` `build-support/go/module.nix`
{
  lib,
  stdenv,
  go,
  cacert,
  git,
  # Our common hackagon stuff:
  libComponent, # An instance of the hackagon 'components' library.
  quitsh, # The quitsh derivation.
}:
{
  # The component name we are building.
  compName,
  # The package name.
  pname,
  # The package version.
  version,
  # The source directory of this Go build.
  src,
  # The SRI hash of the vendored dependencies.
  # If vendor hash is `nulL`, then no dependencies are fetched and
  # the build relies on the vendor folder within the source.
  vendorHash,

  # Build inputs used by this build of the derivation.
  nativeBuildInputs ? [ ],
  # Additional attributes to pass through.
  passthru ? { },
  # Go build flags (additional ones).
  buildFlags ? [ ],

  # Target to copy in install-phase.
  target ? "service",

  # Build flags for `quitsh`.
  buildType ? "release",
  environmentType ? "production",
  ...
}@args:
let
  buildDir = libComponent.getBuildDir ".";
  compDirRel = libComponent.getRootPathRel compName;
  name = "${args.pname}-${args.version}";

  # General GO build variables.
  GO111MODULE = "on";
  # Use the same toolchain as the invoked `go` executable.
  GOTOOLCHAIN = "local";

  # Define the toolchain variable for `cnQuitsh` to
  # work with `--skip-toolchain-dispatch`.
  QUITSH_TOOLCHAINS = "build-go";

  # Set all go build flags.
  goFlags =
    buildFlags
    ++ (lib.warnIf (lib.any (lib.hasPrefix "-mod=") buildFlags)
      "do not use -mod=..., its not supported!"
      [ ]
    );

  goFlagsTests = buildFlags;

  # This is a fixed-output derivation (`outputHash`).
  # It will cache all dependencies in the `go.mod` file.
  # but only when `vendorHash` is not `null`.
  # Otherwise the build uses the vendor folder.
  goModules =
    if (vendorHash == null) then
      null
    else
      (stdenv.mkDerivation {
        name = "${name}-go-modules";

        inherit (args) src version;

        env = {
          inherit (go) GOOS GOARCH;
          inherit GO111MODULE GOTOOLCHAIN;
        };

        nativeBuildInputs = nativeBuildInputs ++ [
          go
          git
          cacert
        ];

        prePatch = "";
        patches = [ ];
        patchFlags = [ ];
        postPatch = "";
        preBuild = "";
        postBuild = "";
        sourceRoot = "";

        impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
          "GIT_PROXY_COMMAND"
          "SOCKS_SERVER"
          "GOPROXY"
        ];

        configurePhase = ''
          runHook preConfigure
          export GOCACHE=$TMPDIR/go-cache
          export GOPATH="$TMPDIR/go"
          cd "${compDirRel}"
          runHook postConfigure
        '';

        buildPhase = ''
          runHook preBuild
          if [ -d vendor ]; then
            echo "vendor folder exists, please set 'vendorHash = null;' in your expression"
            exit 10
          fi

          export GIT_SSL_CAINFO=$NIX_SSL_CERT_FILE

          echo "Download all deps with 'go mod download'...: go version: $(go version)"
          mkdir -p "$GOPATH/pkg/mod/cache/download"
          go mod download

          mkdir -p vendor

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall

          rm -rf "$GOPATH/pkg/mod/cache/download/sumdb"
          cp -r --reflink=auto "$GOPATH/pkg/mod/cache/download" $out

          if ! [ "$(ls -A "$out")" ]; then
            echo "Vendor folder is empty, please set 'vendorHash = null;' in your expression"
            exit 10
          fi

          runHook postInstall
        '';

        dontFixup = true;

        outputHashMode = "recursive";
        outputHash = vendorHash;
        # Handle empty vendorHash; avoid
        # error: empty hash requires explicit hash algorithm.
        outputHashAlgo = if vendorHash == "" then "sha256" else null;
      });

  package = stdenv.mkDerivation {
    inherit (args) pname src version;

    env = {
      inherit (go) GOOS GOARCH;
      inherit GO111MODULE GOTOOLCHAIN QUITSH_TOOLCHAINS;
    };

    inherit goModules;

    # Compile time dependencies.
    nativeBuildInputs = [
      go
      git
      quitsh
    ]
    ++ nativeBuildInputs;

    configurePhase =
      args.configurePhase or ''
        runHook preConfigure

        export GOCACHE=$TMPDIR/go-cache
        export GOPATH="$TMPDIR/go"
        export GOPROXY=off
        export GOSUMDB=off
        export GOFLAGS="${lib.concatStringsSep " " goFlags}"

      ''
      + (lib.optionalString (vendorHash != null) ''
        export GOPROXY="file://${goModules}"
      '')
      + ''
        runHook postConfigure
      '';

    buildPhase =
      args.buildPhase or ''
        runHook preBuild
        echo "Build dir: $(pwd)"

        # Make a Git repo just for the sake of the tooling.
        git -c init.defaultBranch=main init .

        ${lib.getExe quitsh} exec-target \
          --log-level debug \
          --skip-toolchain-dispatch \
          -K "build.buildType: ${buildType}" \
          -K "build.environmentType: ${environmentType}" \
          "${compName}::build-nix"

        runHook postBuild
      '';

    doCheck = args.doCheck or true;

    checkPhase =
      args.checkPhase or ''
        runHook preCheck
        export GOFLAGS="${lib.concatStringsSep " " goFlagsTests}"

        ${lib.getExe quitsh} exec-target \
          --log-level debug \
          --skip-toolchain-dispatch \
          "${compName}::test-nix"

        runHook postCheck
      '';

    # TODO: https://gitlab.com/data-custodian/custodian/-/issues/186
    installPhase =
      args.installPhase or ''
        runHook preInstall
        cd ${compDirRel}

        mkdir -p "$out/bin"
        cp -r "${buildDir}/bin/${target}" \
              "$out/bin/${pname}"

        runHook postInstall
      '';

    strictDeps = true;
    disallowedReferences = [ go ];

    # Expose the following attributes as well.
    passthru = passthru // {
      inherit go;
    };

    meta = {
      # Add default meta information.
      platforms = go.meta.platforms or lib.platforms.all;
    }
    // args.meta;
  };
in
package

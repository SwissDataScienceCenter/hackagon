# Nix build support function for Node.js (pnpm) projects.
# Mirrors `buildGoModule` but for pnpm-based builds.
{
  lib,
  stdenv,
  git,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  nodejs,
  makeShellWrapper,
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
  # The source (component directory) of this Go build.
  src,
  # The SRI hash of the vendored dependencies.
  # If vendor hash is `null`, then no dependencies are fetched and
  # the build relies on the vendor folder within the source.
  vendorHash,

  # The output binary.
  target ? "service",

  # Build flags for `quitsh`.
  buildType ? "release",
  environmentType ? "production",

  # Meta information for `mkDerivation`.
  meta,

  ...
}@args:
let
  buildDir = libComponent.getBuildDir ".";
  compDirRel = libComponent.getRootPathRel compName;
  # The name of the derivation.
  name = "${pname}-${version}";

  forwardArgs = lib.removeAttrs args [
    "vendorHash"
    "compName"
  ];
in
stdenv.mkDerivation (
  finalAttrs:
  forwardArgs
  // {
    inherit
      version
      name
      pname
      src
      meta
      ;

    env = {
      # To make quitsh honor the toolchain skip!
      QUITSH_TOOLCHAINS = "build-node-pnpm";
    };

    nativeBuildInputs = ([
      git
      nodejs
      pnpm
      pnpmConfigHook
      makeShellWrapper
    ]);

    buildPhase = ''
      # Make a Git repo just for the sake of the tooling.
      git -c init.defaultBranch=main init .

      ${lib.getExe quitsh} exec-target \
            --log-level debug \
            --skip-toolchain-dispatch \
            -K "build.buildType: ${buildType}" \
            -K "build.environmentType: ${environmentType}" \
            "${compName}::build-nix"
    '';

    installPhase = ''
      cd "${compDirRel}"

      mkdir -p "$out/bin"
      mv "${buildDir}/share" "$out"

      [ -d "$out/share/${target}" ] || {
        echo "No '${target}' in out folder '$out/share'."
        exit 1
      }

      makeShellWrapper "${nodejs}/bin/node" "$out/bin/${pname}" \
        --add-flags "$out/share/${target}"
    '';

    pnpmDeps = fetchPnpmDeps {
      fetcherVersion = 3;
      inherit pnpm;
      inherit (finalAttrs) pname version src;
      sourceRoot = "${finalAttrs.src.name}/${compDirRel}";
      hash = vendorHash;
    };
    pnpmRoot = compDirRel;
  }
)

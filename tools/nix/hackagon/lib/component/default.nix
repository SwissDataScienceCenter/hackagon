{
  lib,
  libCommon,
  rootDir,
}:
let
  configFileName = ".component.yaml";

  # All query functions.
  query = (import ./query.nix) { inherit lib libCommon configFileName; };

  # All components.
  comps = query.getComponents { path = rootDir; };

  # All package functions.
  packages = (import ./packages.nix) { inherit lib libCommon; };
in
{
  inherit configFileName;
  inherit query;

  # All components found in `rootDir`.
  # Type: [Component] (see `getComponents`).
  inherit comps;

  # Define all packages for each component in `components` which are defined in
  # `./tools/nix/pkgs` in each component folder.
  # Attribute set `args` is forwarded to the import.
  loadPackages = args: packages.import { inherit args comps; };

  # Root paths of components.
  getRootPathRel = compName: (lib.getAttr compName comps).pathRel;
  getRootPath = compName: (lib.getAttr compName comps).path;

  /*
    Get the version of a component.

    # Inputs
    `compRoot`: The component source directory where `.component.yaml` resides.

    # Type
    ```
    readVersion :: Path -> String
    ```
    # Examples
    ```nix
    readVersion "./components/a"
    => "3.0.1"
    ```
  */
  readVersion = compName: comps.${compName}.config.version;

  /*
    Returns the build directory in the components directory.

    # Inputs
    `compRoot` : The component directory.

    # Type
    ```
    getBuildDir :: String -> String
    ```
    # Examples
    ```nix
    getBuildDir "./components/a"
    => ./components/a/.output/build
    ```
  */
  getBuildDir =
    compRoot:
    lib.concatStringsSep "/" [
      compRoot
      ".output"
      "build"
    ];
}

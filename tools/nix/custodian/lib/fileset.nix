{
  lib,
  libComponent,
  rootDir,
  rootFileset,
}:
let
  fs = lib.fileset;

  # All filesets.
  # = { compName = FileSet; ...}
  compFileSets = lib.mapAttrs (compName: comp: fs.fromSource comp.path) libComponent.comps;

  isFileset = a: (a._type or "") == "fileset";
in
{
  inherit rootDir;
  compsDir = rootDir + "/components";

  getRootPathRel = libComponent.getRootPathRel;
  getRootPath = libComponent.getRootPath;

  # The filesets for each component.
  # Note: You cannot evaluate this directly with `nix repl`
  #       Use `toSource` and the inspect.
  components = compFileSets // {
    root = rootFileset;
  };

  /*
    Add the local files contained in the given filesets or fileset names (in `components.$filesetName`)
    to the store by using the `rootPath` as `root` in `toSource`.
    The `rootPath` in `toSource` represents the toplevel directory in the generated
    `/nix/store/...` path.

    See [fileset.toSource]().

    # Inputs

    `filesets`

    : The fileset names in `components` or pure `Fileset`s to put into the store.

    # Type

    ```
    toSource:: [String or Fileset] -> SourceLike
    ```
    :::
  */
  toSource =
    filesets:
    let
      # Either accept a fileset name (look it up in `compFileSets` or it is a fileset itself.)
      sets = lib.map (arg: if (isFileset arg) then arg else compFileSets."${arg}") filesets;

      # Unionify all filesets together.
      sum = fs.unions sets;

      # Intersect with rootFileset to only include
      # what is in the root (no non-Git files).
      final = fs.intersection rootFileset sum;
    in
    fs.toSource {
      root = rootDir;
      fileset = final;
    };
}

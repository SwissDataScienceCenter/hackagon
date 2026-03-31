{
  lib,
  libCommon,
  configFileName,
}:
let
  inherit (lib.attrsets) filterAttrs;
  inherit (builtins) readDir pathExists;
in
{
  /*
    Gets all components in `path`.

    # Inputs
    `path` : Path to search for components.

    # Type
    ```
    getComponents :: Path -> { "component-a" = {path, basename, config}; ... }@Component
    ```

    # Examples
    ```nix
    getComponents ./components
    =>
    {
      pdp = {
        basename = "service-a"; # Read from `.component.yaml`
        path = ./component/service-a;
        config = ./components/service-a/.component.yaml;
      };
      ...
    }
    ```
  */
  getComponents =
    {
      path,
      configName ? configFileName,
    }:
    let
      # Get the component config in the dir.
      getCompConfig =
        dir:
        let
          config = dir + "/${configName}";
          exists = pathExists config;
        in
        {
          inherit config exists;
        };

      # Determine if output from `readDir` is a directory.
      isDir = basename: type: type == "directory";

      # List directory entries in the `dir`: [ entry, ... ]
      # where `entry := { path = "..."; basename = "..."}`
      getDirs =
        path:
        let
          res = filterAttrs isDir (readDir path);
        in
        lib.mapAttrsToList (basename: type: { path = lib.path.append path basename; }) res;

      # Visit a directory entry and determine if its a component.
      # otherwise recurse.
      visitDir =
        { path, ... }@entry:
        let
          res = getCompConfig path;
        in
        if res.exists then
          # Return the component.
          [ (entry // { inherit (res) config; }) ]
        else
          # Recurse to the directory.
          getComponents path;

      # Gets all components (directories with `.component.yaml` file)
      # recursively inside `dir`
      # = [ { basename = "..."; path = "...";}, ... ]
      getComponents =
        path:
        let
          dirs = getDirs path; # dirs = [ entry, ...]
        in
        # Concatng will reduce all [ visitDir(entry) => [], ... ] to
        # one flat map.
        builtins.concatMap visitDir dirs;

      # Map that to proper components: { "comp-name" = {...}; ... }
      toComponentAttr =
        comps:
        builtins.listToAttrs (
          map (
            e:
            let
              conf = libCommon.yaml.readSimple e.config [
                "name"
                "version"
                "language"
              ];
            in
            {
              name = conf.name;
              # Update the component entry
              # with the read YAML file.
              value = e // {
                name = conf.name;
                config = conf;
                pathRel = lib.path.removePrefix path e.path;
              };
            }
          ) comps
        );
    in
    toComponentAttr (getComponents path);
}

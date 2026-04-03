{ lib, libCommon, ... }:
let
  # Load all components packages by loading
  # `<compPath>/tools/nix/pkgs/default.nix` which must define a
  # an AttrSet of derivations.
  # The result is `{ compName = { pkg-a = derivation-a;, pkgs-b = ...}, ...}`

  /*
    Load all components packages by loading for each components `comp`=
    `<compPath>/tools/nix/pkgs/default.nix` which must define a
    an AttrSet of derivations.

    The result is `{ compName = { pkg-a= derivation-a; pkgs-b = ...; }, ...}`

    # Inputs

    `args`= Attribute set which is forwarded to the import function.
    `components` = Attribute set of components, e.g. see `libComponent.comps`.

    # Type

    ```
    import :: { args, components = { compName = Component; ...} } ->
                { compName = { pkg-a = derivation-a; pkgs-b = ...}, ...}
    ```

    # Examples
    ```nix
    packages libComponent.comps
    =>
    {
      components-a = {
         pkg-a = <<derivation>>
      };
      ...
    }
    ```
  */
  import =
    {
      args,
      comps,
    }:
    libCommon.attrset.filterEmpty (
      builtins.mapAttrs (
        compName: comp:
        let
          pkgsPath = comp.path + "/tools/nix/pkgs";
          exists = (builtins.pathExists pkgsPath);
          p = builtins.import pkgsPath args;
        in
        lib.optionalAttrs exists p
      ) comps
    );
in
{
  inherit import;
}

{ lib, ... }:
let
  isEmpty =
    value:
    if builtins.isAttrs value then
      (builtins.length (builtins.attrNames value)) == 0
    else if builtins.isList value then
      (builtins.length value) == 0
    else if builtins.isNull value then
      true
    else
      false;

  # Removes empty sets/lists and null values from an attribute set `attrs`.
  #
  # filterEmpty:: AttrSet -> AttrSet
  #
  filterEmpty = attrs: lib.attrsets.filterAttrs (k: v: !isEmpty v) attrs;

  # Flatten an AttrSet `attrs`
  # by concatenating keys with delimiter `del` and taking only
  # the values which fulfill `cond`
  #
  # flattenCond:: String -> (Key -> Value -> Bool) -> AttrSet
  flattenTill =
    del: cond: attrs:
    lib.listToAttrs (
      lib.attrsets.collect (x: x ? "__collect") (
        lib.mapAttrsRecursiveCond cond (path: value: {
          name = builtins.concatStringsSep del path;
          inherit value;
          __collect = true;
        }) attrs
      )
    );

  # Recursive function to flatten an AttrSet `attrs`
  # by concatenating keys with delimiter `del`.
  #
  # Type:
  # flatten:: String -> AttrsSet -> AttrSet
  #
  # Example:
  # set = { a = { b = { c = 1;}; d = 3; }; };
  # res = flatten "-" set
  # res = { a-b-c = 1; a-d = 3;};
  flatten = del: attrs: flattenTill del (v: true) attrs;

  # Flatten all derivations.
  flattenDrvs = attrs: flattenTill "-" (v: !lib.isDerivation v) attrs;
in
{
  inherit
    filterEmpty
    flatten
    flattenTill
    flattenDrvs
    ;
}

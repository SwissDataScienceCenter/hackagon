{ lib, ... }:

{
  # A derivation which contains the `/etc/group` and `/etc/passwd` files
  # with `root` and `non-root` user with an invalid shell.
  # TODO: Check if root can be removed. We anyway never run it as root.
  etcGroupAndPasswd = lib.fileset.toSource {
    root = ./files;
    fileset = ./files/etc;
  };
}

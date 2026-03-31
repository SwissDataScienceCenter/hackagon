{
  inputs,
  ...
}:
let
  quitsh = inputs.quitsh;
in
{
  # Make a devenv shell from some modules.
  mkShell =
    {
      inputs,
      modules ? [ ],
      pkgs ? null,
      system ? null,
    }@args:
    quitsh.lib.mkShell args;
}

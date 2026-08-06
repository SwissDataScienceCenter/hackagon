{
  lib,
  cnLib,
  buildType ? "release",
  environmentType ? "production",
  ...
}:
let
  cnFilesets = cnLib.fileset;
  cnComponents = cnLib.component;
  compName = "frontend";
in
cnLib.build.buildNodePackage {
  inherit compName buildType environmentType;
  pname = compName;
  version = cnComponents.readVersion compName;

  src = cnFilesets.toSource [
    compName
  ];

  target = "service";
  vendorHash = null; # Will be set by `just quitsh nix fix-hash`

  meta = {
    description = compName;
    homepage = "https://github.com/swissdatasciencecenter/hackagon";
    license = lib.licenses.agpl3Plus;
    maintainers = [ "sdcs-ordes" ];
    mainProgram = compName;
  };
}

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
  compName = "contract-manager";
in
cnLib.build.buildGoModule {
  inherit compName buildType environmentType;
  pname = compName;
  version = cnComponents.readVersion compName;

  src = cnFilesets.toSource [
    compName
  ];

  target = "service";
  vendorHash = "sha256-4QSqTxx/Px9K1jd3i/zfdB3uqllTTEm/mv6ZwT6mgX0=";

  meta = {
    description = compName;
    homepage = "https://github.com/swissdatasciencecenter/hackagon";
    license = lib.licenses.agpl3Plus;
    maintainers = [ "sdcs-ordes" ];
    mainProgram = compName;
  };
}

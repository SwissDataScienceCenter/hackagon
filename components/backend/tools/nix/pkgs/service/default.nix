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
  compName = "backend";
in
cnLib.build.buildGoModule {
  inherit compName buildType environmentType;
  pname = compName;
  version = cnComponents.readVersion compName;

  src = cnFilesets.toSource [
    compName
  ];

  target = "service";
  vendorHash = "sha256-fq2vUGbWPV+sDivkiQuamC1lAZjy8VT8aa0/ipU8Ec8=";

  meta = {
    description = compName;
    homepage = "https://github.com/swissdatasciencecenter/hackagon";
    license = lib.licenses.agpl3Plus;
    maintainers = [ "sdcs-ordes" ];
    mainProgram = compName;
  };
}

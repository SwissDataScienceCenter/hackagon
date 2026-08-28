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

  # `VERSION` at the repo root, alongside the component itself: the build stamps
  # it into the footer (see `vite.config.ts`), and a fileset holding only
  # `components/frontend` left it unreadable, so every image reported `0.0.0`.
  src = cnFilesets.toSource [
    compName
    (lib.fileset.unions [ (cnFilesets.rootDir + "/VERSION") ])
  ];

  target = "service";
  vendorHash = "sha256-vAYKh4Ee5DymXbuNdvZPh+sne5IcP8LGJ0/NyihuTq4="; # Will be set by `just quitsh nix fix-hash`

  meta = {
    description = compName;
    homepage = "https://github.com/swissdatasciencecenter/hackagon";
    license = lib.licenses.agpl3Plus;
    maintainers = [ "sdcs-ordes" ];
    mainProgram = compName;
  };
}

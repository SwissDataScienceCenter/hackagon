args:
let
  compName = "frontend";

  service = args.pkgs.callPackage ./service (args // { inherit compName; });
  service-image = args.pkgs.callPackage ./service-image (args // { inherit compName service; });
in
{
  inherit service-image service;
}

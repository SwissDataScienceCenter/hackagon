args:
let
  compName = "backend";

  service = args.pkgs.callPackage ./service (args // { inherit compName; });
  service-dev = args.pkgs.callPackage ./service (
    args
    // {
      inherit compName;
      buildType = "debug";
      environmentType = "development";
    }
  );

  service-image = args.pkgs.callPackage ./service-image (args // { inherit compName service; });
in
{
  inherit service-dev service service-image;
}

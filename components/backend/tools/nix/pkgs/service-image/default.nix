{
  pkgs,
  service,
  cnLib,
  ...
}:
pkgs.dockerTools.buildLayeredImage {
  name = "hackagon/${service.pname}-service";
  tag = service.version;

  contents = [
    cnLib.image.etcGroupAndPasswd
    service
  ];

  # Users come from a static /etc/passwd rather than `shadowSetup`, so the
  # build needs no chroot: `enableFakechroot` relies on `proot`, which does
  # not work on Darwin. Paths are relative to the image root, which is the
  # working directory of the restricted fakeroot environment.
  fakeRootCommands = ''
    mkdir -p workspace/data/api

    chown -R 1000:1000 workspace
    chmod -R u+rw workspace
  '';

  config = {
    Entrypoint = [ "${service}/bin/${service.pname}" ];
    WorkingDir = "/workspace";
    Volumes = {
      "/workspace/config" = { };
      "/workspace/data" = { };
    };
    Env = [
      "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
    ];
    Labels = {
      "org.opencontainers.image.source" = "https://github.com/swissdatasciencecenter/hackagon";
      "org.opencontainers.image.description" = service.meta.description;
      "org.opencontainers.image.license" = service.meta.license.shortName;
      "org.opencontainers.image.version" = service.version;
    };
    User = "non-root";
  };
}

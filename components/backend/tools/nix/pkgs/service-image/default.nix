{
  pkgs,
  service,
  ...
}:
pkgs.dockerTools.buildLayeredImage {
  name = "hackagon/${service.pname}-service";
  tag = service.version;

  contents = [
    service
  ];

  fakeRootCommands = ''
    ${pkgs.dockerTools.shadowSetup}
    # Link API files, to execution folder.
    mkdir -p /workspace/data/api

    groupadd -r non-root -g 1000
    useradd -r -g non-root -u 1000 non-root
    chown -R non-root:non-root /workspace
    chmod -R u+rw /workspace
  '';

  enableFakechroot = true;

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

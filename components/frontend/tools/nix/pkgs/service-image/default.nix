{
  dockerTools,
  cacert,
  service,
  pinned,
  cnLib,
  ...
}:
dockerTools.buildLayeredImage {
  name = "hackagon/${service.pname}-service";
  tag = service.version;

  contents = [
    cnLib.image.etcGroupAndPasswd
    cacert
    service
  ];

  fakeRootCommands = ''
    mkdir -p workspace/data workspace/config tmp

    chown -R 1000:1000 workspace tmp
    chmod -R u+rw workspace tmp
  '';

  config = {
    Entrypoint = [
      "${pinned.nodejs}/bin/node"
      "${service}/share/service"
    ];
    WorkingDir = "/workspace";
    Volumes = {
      "/workspace/config" = { };
      "/workspace/data" = { };
    };
    Env = [
      "NODE_ENV=production"
      "SSL_CERT_FILE=${cacert}/etc/ssl/certs/ca-bundle.crt"
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

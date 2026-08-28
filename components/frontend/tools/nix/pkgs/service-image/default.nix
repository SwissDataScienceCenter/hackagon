{
  lib,
  dockerTools,
  cacert,
  service,
  pinned,
  cnLib,
  ...
}:
let
  # The commit this image was built from. Baked into the image rather than
  # supplied by the deployment, so the artifact describes itself: a chart that
  # pins `tag: latest` still yields a footer naming the real commit, and no
  # deploy-time misconfiguration can make the image claim to be something else.
  inherit (cnLib) rev shortRev;
in
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
    ]
    # Read at runtime by the root layout load, not compiled into the bundle:
    # this keeps the expensive pnpm/vite derivation cache-stable across commits
    # while still letting every deployed page name its own commit.
    ++ lib.optional (shortRev != null) "HACKAGON_BUILD_COMMIT=${shortRev}";
    Labels = {
      "org.opencontainers.image.source" = "https://github.com/swissdatasciencecenter/hackagon";
      "org.opencontainers.image.description" = service.meta.description;
      "org.opencontainers.image.license" = service.meta.license.shortName;
      "org.opencontainers.image.version" = service.version;
    }
    # The standard label for provenance, so `skopeo inspect` answers the same
    # question the footer does without pulling and running the image.
    // lib.optionalAttrs (rev != null) {
      "org.opencontainers.image.revision" = rev;
    };
    User = "non-root";
  };
}

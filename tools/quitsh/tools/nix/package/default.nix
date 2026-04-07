{
  lib,
  buildGo125Module,
  installShellFiles,
  testers,
  git,
  cnLib,
  self,
}:
let
  compName = "quitsh";
  libFileset = cnLib.fileset;
  libComponent = cnLib.component;
in
# NOTE: It can be that this derivation does not build anymore.
#       This is probably due to caching of the source directory.
#       Before debugging: Change the .component.yaml version and increment its patch number
#       to trigger another source hash.
buildGo125Module rec {
  pname = compName;

  version = libComponent.readVersion compName;
  src = libFileset.toSource [
    compName
  ];

  modRoot = libFileset.getRootPathRel compName;
  # This hash which is hard coded is baked into
  # hash=$(nix show-derivation "../nix#quitsh.goModules" | jq -r ".[] | .outputs.out.hash");
  # nix hash convert --hash-algo sha256 $hash
  # To check if a new hash must be here:
  # Delete the store path to `goModules`
  # nix store delete $(nix show-derivation "./tools/nix#quitsh.goModules" | jq -r ".[] | .outputs.out.path")
  # then build
  # or use:
  # https://github.com/msteen/nix-prefetch/issues/3
  vendorHash = "sha256-2Zmec2YsSqyo+c9+8DxgqoQGqpP/wJVqmFoz9YwVgUs=";
  proxyVendor = true;

  nativeBuildInputs = [ installShellFiles ];
  nativeCheckInputs = [ git ];

  ldflags =
    let
      modulePath = "github.com/swissdatasciencecenter/hackagon/tools/quitsh";
    in
    [
      "-s"
      "-w"
      "-X ${modulePath}/pkg/build.buildVersion=${version}"
    ];

  postInstall = ''
    installShellCompletion --cmd quitsh \
      --bash <($out/bin/quitsh completion bash) \
      --fish <($out/bin/quitsh completion fish) \
      --zsh <($out/bin/quitsh completion zsh)
  '';

  passthru.tests.version = testers.testVersion {
    package = self;
    command = "quitsh --version";
    inherit version;
  };

  meta = with lib; {
    description = "Tool to build/test/lint/deploy components in a monorepo - quit using `sh`.";
    homepage = "https://github.com/swissdatasciencecenter/hackagon";
    license = licenses.agpl3Plus;
    maintainers = [ "gabyx" ];
    mainProgram = "quitsh";
  };
}

{ }:
let
  # Create Devenv modules where `pkgs` is the normal packages from `nixpkgs`,
  # and `pinnedPkgs` contains packages which are pinned.
  #
  # Currently the following packages need to be in `pkgsPinned`:
  #   - `python`
  #   - `go`
  #   - `quitsh`
  #
  createDevenvModules =
    { pkgs, pkgsPinned }:
    let
      quitsh-direct-drv = pkgs.writeShellApplication {
        name = "quitsh-direct";
        text = ''
          #!/usr/bin/env sh
          root=$(git rev-parse --show-toplevel) || {
            echo "Could not determine repo. root dir." >&2
          }
          just -f "$root/tools/quitsh/justfile" run "$@"
        '';
        runtimeInputs = [
          pkgs.bash
          pkgs.git
          pkgs.just
          pkgsPinned.go
        ];
      };

      quitsh-direct = [
        {
          packages = [
            quitsh-direct-drv
          ];
        }
      ];

      quitsh-setup = [
        (
          { config, ... }:
          {
            enterShell = ''
              quitsh=$(command -v "quitsh-direct" 2>/dev/null || echo "quitsh")
              f="$DEVENV_DOTFILE/state/quitsh/setup-done"
              if [ ! -f "$f" ]; then
                mkdir -p $(dirname "$f") && touch "$f"
                "$quitsh" setup
              else
                ${config.quitsh.log.package}/bin/log info "Setup 'quitsh setup' already performed. ✅"
              fi
              unset quitsh
            '';
          }
        )
      ];

      addSetup = modules: modules ++ quitsh-setup;

      build-go = [
        {
          quitsh.toolchains = [ "build-go" ];
          quitsh.languages.go = {
            enable = true;
            # To make CGO and the debugger delve work.
            # https://nixos.wiki/wiki/Go#Using_cgo_on_NixOS
            # Note: Due to warning when compiling `_FORTIFY_SOURCE`
            enableHardeningWorkaround = true;
            package = pkgsPinned.go;
          };

          packages = [
            pkgs.git
          ];
        }
      ];

      # Main languages.
      dev-go = [
        {
          packages = [
            pkgs.golangci-lint
            pkgs.golangci-lint-langserver
            pkgs.typos-lsp
          ];
        }
      ];

      build-node-pnpm = [
        {
          quitsh.toolchains = [ "build-node-pnpm" ];
          packages = [
            pkgsPinned.nodejs
            pkgsPinned.pnpm
          ];
        }
      ];

      test-services =
        let
          realm-file = "./tools/configs/keycloak/realm-hackagon.json";
          createProcCompLog = service: ".output/run/process-compose/${service}-log";
        in
        [
          {
            process.managers.process-compose = {
              package = pkgs.process-compose;
              settings = {
                log_level = "info";
                log_location = ".output/run/process-compose/log";
                log_configuration = {
                  no_metadata = false;
                  flush_each_line = true;
                  add_timestamp = true;
                  disable_json = true;
                };
              };
            };

            processes = {
              keycloak.process-compose.log_location = createProcCompLog "keycloak";

              keycloak-realm-export-all = {
                process-compose = {
                  log_location = createProcCompLog "keycloak-realm-export-all";
                  disabled = true;
                };
              };

              format-realm-export = {
                exec = ''
                  set -eu
                  echo "Formatting realm export ..."
                  ${pkgs.jq}/bin/jq --sort-keys . "${realm-file}" > "${realm-file}.mod"
                  mv "${realm-file}.mod" "${realm-file}"
                  ${pkgs.nodePackages_latest.prettier}/bin/prettier -w "${realm-file}"
                  echo "Restart keycloak..."
                  ${pkgs.process-compose}/bin/process-compose \
                    --unix-socket "$PC_SOCKET_PATH" process start keycloak
                '';
                process-compose = {
                  disabled = true;
                  depends_on = {
                    keycloak-realm-export-all = {
                      condition = "process_completed_successfully";
                    };
                  };
                };
              };
              };

            services = {
              keycloak = {
                enable = true;
                settings.http-port = 8080;
                database.type = "dev-file";
                realms = {
                  hackagon = {
                    path = "${realm-file}";
                    export = true;
                    import = true;
                  };
                };
              };
            };
          }
        ];

      lint-go = [
        {
          quitsh.toolchains = [ "lint-go" ];

          packages = [
            pkgs.git
            pkgs.golangci-lint
            pkgsPinned.go
          ];
        }
      ];

      lint-jsonschema = [
        {
          packages = [
            # Validation
            pkgs.check-jsonschema
          ];
        }
      ];

      doc-sphinx = [
        {
          languages.python = {
            enable = true;
            package = pkgsPinned.python;
            uv.enable = true;
          };

          quitsh.toolchains = [ "doc-sphinx" ];
        }
      ];

      doc-mkdocs = [
        {
          languages.python = {
            enable = true;
            package = pkgsPinned.python;
            uv.enable = true;
          };

          quitsh.toolchains = [ "doc-mkdocs" ];
        }
      ];

      run-python = [
        {
          languages.python = {
            enable = true;
            package = pkgsPinned.python;
            uv.enable = true;
          };

          quitsh.toolchains = [ "run-python" ];
        }
      ];

      image-containerfile = [
        {
          quitsh.toolchains = [ "image-containerfile" ];
          packages = [
            pkgs.git
            pkgs.buildah
            pkgs.skopeo
          ];
        }
      ];

      image-nix = [
        {
          quitsh.toolchains = [ "image-nix" ];

          packages = with pkgs; [
            git
            skopeo
          ];
        }
      ];

      manifest-ytt = [
        {
          quitsh.toolchains = [ "manifest-ytt" ];

          packages = [
            pkgs.ytt
            pkgs.imgpkg
            pkgs.kbld
            pkgs.kubernetes-helm
            pkgs.vendir
            pkgs.sops
          ];
        }
      ];

      coverage-upload = [
        {
          quitsh.toolchains = [ "coverage-upload" ];

          packages = [
            pkgsPinned.codecov-cli
          ];
        }
      ];

      lint-trivy = [
        {
          quitsh.toolchains = [ "lint-trivy" ];
          packages = [
            pkgs.trivy
          ];
        }
      ];

      default =
        ci
        ++ build-go
        ++ dev-go
        ++ build-node-pnpm
        ++ manifest-ytt
        ++ quitsh-direct
        ++ [
          (
            { lib, ... }:
            {
              quitsh.toolchains = [ "general" ];

              quitsh.config = lib.mkForce "tools/configs/quitsh/config.yaml";
              quitsh.configUser = "tools/configs/quitsh/config.user.yaml";

              dotenv.enable = true;

              packages = [
                # Essentials.
                pkgs.git
                pkgs.just
                pkgs.fd

                # Manifests
                # added by manifest-ytt module.

                # Web-Traffic
                pkgs.xh # WARNING: Use this instead of httpie adds PYTHONPATH
                pkgs.jwt-cli # Decode jwt tokens.

                # Inspect/upload images.
                pkgs.dive
                pkgs.skopeo

                # Process manager.
                pkgs.process-compose

                # Changelog
                pkgs.git-cliff
              ];
            }
          )
        ];

      frontend = ci ++ build-node-pnpm ++ quitsh-direct;

      ci = [
        {
          quitsh.toolchains = [
            "ci"
            "git"
          ];
          quitsh.config = "tools/configs/quitsh/config-ci.yaml";

          packages = [
            pkgs.hackagon.bootstrap
            pkgs.hackagon.quitsh
            pkgs.podman

            pkgs.openssh # SSH agent
          ];
        }
      ];

    in
    {
      # Main shells:
      default = addSetup default;
      frontend = addSetup frontend;
      ci = addSetup ci;

      # Toolchains:
      inherit
        # General CI ---------
        build-go
        build-node-pnpm
        lint-go
        lint-trivy
        lint-jsonschema

        image-nix
        image-containerfile

        manifest-ytt
        # --------------------

        # Auxiliary Tooling --
        run-python
        doc-mkdocs
        doc-sphinx

        coverage-upload
        # --------------------

        # General Development --
        dev-go
        # ----------------------
        ;

      # Testing:
      inherit
        test-services
        ;

      # Quitsh:
      inherit
        quitsh-direct
        quitsh-setup
        ;
    };

in
{
  inherit createDevenvModules;
}

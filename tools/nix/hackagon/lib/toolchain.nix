{ lib, ... }:
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
      createProcCompLog = service: ".output/run/process-compose/${service}-log";

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
            pkgs.ginkgo
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

      createTestingHackagon =
        {
          isCI,
          withFrontend ? true,
          withBackend ? true,
          withPostgres ? true,
        }:
        [
          (
            { config, ... }:
            let
              realm-file = "./tools/configs/keycloak/realm-hackagon.json";
            in
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

                backend = lib.mkIf withBackend {
                  # NOTE: this enters the Nix dev shell, and that is the single
                  # most expensive fact about this process. Entering it costs
                  # ~5s unopposed (re-measured 2026-08-14; the 44s once written
                  # here was sampled during the frontend crash loop below, not a
                  # floor), and it takes a REPO-WIDE lock while it re-fetches
                  # the tree
                  # ("waiting for another Nix process to finish fetching input
                  # 'git+file:///workspaces/hackagon'…"), so every other
                  # `just develop` anywhere on the machine queues behind it.
                  # The readiness budget below has to cover that wait, because
                  # the probe clock starts when THIS command is launched, not
                  # when the server it eventually starts binds a port.
                  exec = "just develop just run";
                  process-compose = {
                    log_location = createProcCompLog "backend";
                    working_dir = "components/backend";
                    depends_on = {
                      keycloak = {
                        condition = "process_healthy";
                      };
                    };
                    availability = {
                      # `always`, not `on_failure`, because of how a
                      # readiness-probe kill actually looks. When the budget
                      # below runs out process-compose SIGTERMs the process; the
                      # Go server handles that and exits 0 — and `on_failure`
                      # does not consider 0 a failure, so the backend stayed
                      # DOWN and the supervisor recorded it as `Completed`,
                      # exit_code=0, i.e. as having finished successfully.
                      # Reproduced 2026-08-13: `grpc server listening` followed
                      # by `received shutdown signal`, then nothing, forever.
                      # Every downstream symptom (connection refused mid-run, a
                      # browse page listing nothing) came from that.
                      restart = "always";
                      # LOAD-BEARING, not belt-and-braces. The same kill can
                      # also land BEFORE the Go signal handler exists, in which
                      # case the wrapper dies with 143 — which `on_failure`
                      # does consider a failure. Measured 2026-08-13 with the
                      # budget scaled down to force it: 149 restarts in 151
                      # seconds, i.e. one full `nix develop` PER SECOND, which
                      # starves every other service's startup and is exactly the
                      # runaway this file is being changed to prevent. An
                      # uncapped restart policy on a process that enters the Nix
                      # shell is a self-amplifying outage; cap it and a bad
                      # start costs 3 attempts and then says so.
                      max_restarts = 3;
                    };
                    readiness_probe = {
                      exec = {
                        command = "${pkgs.grpcurl}/bin/grpcurl -plaintext localhost:3000 health.HealthService/Check";
                      };
                      initial_delay_seconds = 10;
                      timeout_seconds = 5;
                      success_threshold = 1;
                      # Was 50. Measured on this container 2026-08-13: probes
                      # land ~15s apart (process-compose's default period), so
                      # 50 was a ~12.7 min budget — and a COLD restart of this
                      # service (enter the Nix shell, build quitsh, build the Go
                      # service, boot) took 486s on a QUIET lock. That is 64% of
                      # the budget spent before one competitor for the fetch
                      # lock is added, and each competitor measured +36s. The
                      # margin was ~4 minutes on a machine where the frontend
                      # could take the lock every 55 seconds.
                      #
                      # 150 makes it ~37 min. This costs nothing when the
                      # service is healthy — probing stops at the first success —
                      # and the thing that should decide "the backend did not
                      # come up" is the harness's own timeout
                      # (hackathon-e2e/scripts/wait-ready.sh, 300s, which says
                      # WHICH service and prints why), not a supervisor whose
                      # only move is to kill a server that was merely slow.
                      failure_threshold = 150;
                    };
                  };
                };

                frontend = lib.mkIf withFrontend {
                  exec = if !isCI then "just develop just serve" else "just develop just run";
                  process-compose = {
                    log_location = createProcCompLog "frontend";
                    working_dir = "components/frontend";
                    depends_on = {
                      keycloak = {
                        condition = "process_healthy";
                      };
                    };
                    availability = {
                      restart = "on_failure";
                      # THE RUNAWAY THIS FILE EXISTS TO PREVENT, found live
                      # 2026-08-13 with 54 restarts in 50 minutes.
                      #
                      # `vite dev` binds [::1]:8081. So does the adapter-node
                      # build the e2e harness serves in its place
                      # (hackathon-e2e/scripts/prod-frontend.sh — see the comment
                      # on stop_vite for why it has to). Whenever a previous run
                      # has left that server up, vite cannot bind, exits 1 with
                      # "Error: Port 8081 is already in use", and an uncapped
                      # `on_failure` sends it round again — every ~55s, forever,
                      # and each round is a full `just develop`, i.e. one
                      # acquisition of the repo-wide git+file:// fetch lock.
                      # That is what starved the backend's own startup.
                      #
                      # It was also INVISIBLE: `process list` said
                      # `frontend Running Ready` throughout, because the
                      # readiness probe below is a plain GET of :8081 and the
                      # OTHER server was answering it. A probe that measures a
                      # PORT cannot tell you which PROCESS holds it.
                      #
                      # 3 is enough for a genuine transient (a port freed a
                      # moment later) and small enough that a permanent conflict
                      # costs three shell entries instead of one an hour.
                      # `wait-ready.sh` now reads these counters back and says so
                      # out loud, because the number was there all along and
                      # nothing was looking at it.
                      max_restarts = 3;
                    };
                    readiness_probe = {
                      exec = {
                        command = "${pkgs.curl}/bin/curl http://localhost:8081";
                      };
                      initial_delay_seconds = 10;
                      timeout_seconds = 5;
                      success_threshold = 1;
                      failure_threshold = 100;
                    };
                  };
                };

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
                    ${config.process.managers.process-compose.package}/bin/process-compose \
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
                  settings.http-port = 8180;
                  settings.http-host = "0.0.0.0";
                  # Trust X-Forwarded-* from a fronting proxy (the tunnel's
                  # caddy) so OIDC endpoint URLs and the token issuer follow
                  # the public hostname. Direct localhost use is unaffected:
                  # with no forwarded headers Keycloak falls back to Host.
                  settings.proxy-headers = "xforwarded";
                  # devenv pins hostname=localhost, which freezes the frontend
                  # host and defeats the forwarded headers. Blank it (SmallRye
                  # reads an empty option as unset) and allow dynamic hostname
                  # resolution from the request instead.
                  settings.hostname = lib.mkForce "";
                  settings.hostname-strict = false;
                  # Repo-shipped themes (login branding). Path is relative to
                  # the process working dir (the repo root), same as realm-file
                  # above. Caching off so CSS edits show on refresh in dev.
                  settings."spi-theme--folder--dir" = "./tools/configs/keycloak/themes";
                  settings."spi-theme--cache-themes" = false;
                  settings."spi-theme--cache-templates" = false;
                  settings."spi-theme--static-max-age" = -1;
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
          )

          (lib.optionalAttrs withPostgres {
            processes = {
              postgres.process-compose.log_location = createProcCompLog "postgres";
            };
            services = {
              postgres = {
                enable = true;
                package = pkgs.postgresql_18;
                port = 5432;
                listen_addresses = "127.0.0.1";
                initialDatabases = [
                  {
                    name = "hackagon";
                    user = "postgres";
                    pass = "postgres";
                  }
                ];
                initialScript = ''
                  ALTER ROLE postgres CREATEDB;
                '';
              };
            };
          })
        ];

      test-services = createTestingHackagon {
        isCI = false;
        withFrontend = true;
        withBackend = true;
        withPostgres = true;
      };

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

                # Psql
                pkgs.postgresql_18

                # Grpc
                pkgs.grpcurl
                pkgs.protobuf
                pkgs.protoc-gen-go
                pkgs.protoc-gen-go-grpc
                pkgs.protoc-gen-doc
                pkgs.buf

                # Go testing
                pkgs.ginkgo
              ];
            }
          )
        ];

      frontend = ci ++ build-node-pnpm ++ quitsh-direct;
      backend = ci ++ build-go ++ dev-go ++ quitsh-direct;

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
      ]
      ++ quitsh-direct;

    in
    {
      # Main shells:
      default = addSetup default;
      frontend = addSetup frontend;
      backend = addSetup backend;
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

_: {
  # Used to find the project root
  # For worktrees we need either `.git` or a file.
  projectRootFile = "README.md";

  settings.global = {
    excludes = [
      "external/**/*"
      "**/vendor/**/*"
      # Generated files — managed by codegen, not formatted by hand
      "components/backend/Schema.md"
      "api/proto/API.md"
      "components/backend/internal/proto/**"
      "components/backend/ent/**"
      "components/frontend/src/lib/server/grpc/generated/**"
    ];
  };

  # Enable the following formatters.
  programs.gofmt.enable = true;
  programs.goimports.enable = true;
  programs.golines.enable = true;

  # protobuf
  programs.buf.enable = true;

  # Markdown, JSON, YAML, etc.
  programs.prettier.enable = true;
  settings.formatter.prettier.excludes = [
    "components/.old/*"
    "tools/deploy/.old/*"
    "*/api/openapi*" # this are symlinks, which prettier cannot deal with
    ".golangci.yaml" # this is a symlink, which prettier cannot deal with
    ".yamllint.yaml" # this is a symlink, which prettier cannot deal with
    # pnpm writes this file and owns its style. Formatting it means prettier
    # and pnpm each rewrite it back, so every real dependency change would
    # reappear as a format failure. Same reason the codegen dirs are excluded
    # above: a generated file belongs to its generator.
    "components/frontend/pnpm-lock.yaml"
  ];

  programs.ruff-format.enable = true;

  # Shellscripts (which we should not have!)
  programs.shfmt = {
    enable = true;
    indent_size = 4;
  };
  programs.shellcheck = {
    enable = true;
  };
  settings.formatter.shellcheck = {
    options = [
      "-e"
      "SC1091"
    ];
  };

  # Nix.
  programs.deadnix.enable = false;
  programs.statix.enable = false;
  programs.nixfmt.enable = true;

  # Lua.
  programs.stylua.enable = true;

  # Typos. TODO: Make this work only for markdown, its destructive in other formats.
  # programs.typos.enable = true;
}

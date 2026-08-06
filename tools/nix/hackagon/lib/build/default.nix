{ ... }:
{
  # Function to create a build support function for building a Go module.
  createBuildGoModule = import ./go/build-module.nix;

  # Function to create a build support function for building a Node.js (pnpm) project.
  createBuildNodePackage = import ./node/build-module.nix;
}

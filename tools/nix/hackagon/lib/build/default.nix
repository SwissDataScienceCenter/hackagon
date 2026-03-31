{ ... }:
{
  # Function to create a build support function for building a Go module.
  createBuildGoModule = import ./go/build-module.nix;
}

//go:build test && unittest

package audit_test

import (
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// This package's tests are plain `testing` functions (redact_test.go,
// actor_test.go, produced_test.go), not Ginkgo specs — so this bootstrap
// deliberately runs ZERO specs. It exists because the quitsh test target
// appends `--ginkgo.v` to every package's test binary (see
// components/backend/.component.yaml, target `test-unittest`). Importing
// Ginkgo registers the `-ginkgo.*` flags on flag.CommandLine at init; without
// it the binary exits 1 on "flag provided but not defined: -ginkgo.v" before
// running a single test.
//
// "Ran 0 of 0 Specs" below is therefore expected and is NOT this package's
// result. Its coverage is the TestXxx functions, which `go test -v` runs and
// reports one by one.
func TestAudit(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Audit Suite")
}

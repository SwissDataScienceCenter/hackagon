//go:build test && unittest

package middleware

// RequirePermission lets the tests in middleware_test call the private
// requirePermission.
var RequirePermission = (*Enforcer).requirePermission

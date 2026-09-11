package middleware

import (
	"errors"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type GrpcAuthErrors error

var (
	ErrInternal              GrpcAuthErrors = errors.New("internal error")
	ErrMissingKey            GrpcAuthErrors = errors.New("authorization header missing")
	ErrTokenExpired          GrpcAuthErrors = errors.New("token is expired")
	ErrTokenUsedBeforeIssued GrpcAuthErrors = errors.New("token used before issued")
	ErrTokenNotValidYet      GrpcAuthErrors = errors.New("token is not valid yet")
	ErrTokenMalformed        GrpcAuthErrors = errors.New("token is malformed")
	ErrTokenInvalidIssuer    GrpcAuthErrors = errors.New("bad issuer")
	ErrBadAlgorithm          GrpcAuthErrors = errors.New("bad algorithm")
	ErrJwksLoadError         GrpcAuthErrors = errors.New("jwks load error")
	ErrKIDNotFound           GrpcAuthErrors = errors.New("public key not found")
	ErrBadAuthScheme         GrpcAuthErrors = errors.New("bad auth scheme")
	ErrSignatureInvalid      GrpcAuthErrors = errors.New("signature is invalid")
)

func handleError(err error, setErrorCodes bool) error {
	err = handleJwtError(err)
	if setErrorCodes {
		return setGrpcErrorCodes(err)
	}

	return err
}

// handleJwtError translates a failure from the jwt library into one of this
// package's own errors, which `setGrpcErrorCodes` then turns into
// `Unauthenticated`.
//
// Matched with `errors.Is` against the library's sentinel values. v5 reports a
// bad token by wrapping those sentinels; it has no error *type* to match on —
// the `*jwt.ValidationError` of v4 was removed. This file went on matching the
// v4 type while `auth.go` parsed with v5, so nothing here ever matched and
// every expired, malformed or badly signed token fell through to `Internal`,
// reported to callers as a server fault rather than a rejected login.
//
// Anything unrecognised is returned untouched, so an error raised by `auth.go`
// itself (a missing header, an unknown key id) reaches `setGrpcErrorCodes` as
// the sentinel it already is.
func handleJwtError(errIn error) error {
	switch {
	case errors.Is(errIn, jwt.ErrTokenExpired):
		return ErrTokenExpired
	case errors.Is(errIn, jwt.ErrTokenMalformed):
		return ErrTokenMalformed
	case errors.Is(errIn, jwt.ErrTokenNotValidYet):
		return ErrTokenNotValidYet
	case errors.Is(errIn, jwt.ErrTokenUsedBeforeIssued):
		return ErrTokenUsedBeforeIssued
	case errors.Is(errIn, jwt.ErrTokenInvalidIssuer):
		return ErrTokenInvalidIssuer
	case errors.Is(errIn, jwt.ErrTokenSignatureInvalid):
		// `WithValidMethods` rejects a wrong algorithm through the same
		// sentinel, and only the message tells the two apart.
		if strings.Contains(errIn.Error(), "signing method") {
			return ErrBadAlgorithm
		}

		return ErrSignatureInvalid
	}

	return errIn
}

func setGrpcErrorCodes(err error) error {
	if err == nil {
		return nil
	}

	unauthenticatedErrors := []error{
		ErrTokenExpired,
		ErrTokenMalformed,
		ErrTokenNotValidYet,
		ErrTokenUsedBeforeIssued,
		ErrKIDNotFound,
		ErrBadAlgorithm,
		ErrSignatureInvalid,
		ErrTokenInvalidIssuer,
		ErrBadAuthScheme,
		ErrMissingKey,
	}

	for _, target := range unauthenticatedErrors {
		if errors.Is(err, target) {
			return status.Error(codes.Unauthenticated, err.Error())
		}
	}

	return status.Error(codes.Internal, ErrInternal.Error()+" - "+err.Error())
}

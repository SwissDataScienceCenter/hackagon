package middleware

import (
	"errors"
	"strings"

	"github.com/golang-jwt/jwt/v4"
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

func handleJwtError(errIn error) error {
	var err *jwt.ValidationError
	if errors.As(errIn, &err) {
		switch {
		case err.Is(jwt.ErrTokenExpired):
			return ErrTokenExpired
		case err.Is(jwt.ErrTokenMalformed):
			return ErrTokenMalformed
		case err.Is(jwt.ErrTokenNotValidYet):
			return ErrTokenNotValidYet
		case err.Is(jwt.ErrTokenUsedBeforeIssued):
			return ErrTokenUsedBeforeIssued
		case err.Is(jwt.ErrTokenSignatureInvalid):
			if strings.Contains(err.Error(), "signing method") {
				return ErrBadAlgorithm
			}
			return ErrSignatureInvalid
		}
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

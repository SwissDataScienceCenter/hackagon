package service

import (
	"context"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health"
	messages "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health/messages/health_svc"
)

type HealthService struct {
	health.UnimplementedHealthServiceServer
	startTime time.Time
}

func NewHealthService() *HealthService {
	return &HealthService{
		UnimplementedHealthServiceServer: health.UnimplementedHealthServiceServer{},
		startTime:                        time.Now(),
	}
}

func (s *HealthService) Check(
	_ context.Context,
	_ *messages.CheckRequest,
) (*messages.CheckResponse, error) {
	message := "Service is healthy"

	return &messages.CheckResponse{
		Message: message,
	}, nil
}

func (s *HealthService) GetUptime() time.Duration {
	return time.Since(s.startTime)
}

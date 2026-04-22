package service

import (
	"context"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health"
	messages "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health/messages"
)

type HealthService struct {
	health.UnimplementedHealthServiceServer
	startTime time.Time
}

func NewHealthService() *HealthService {
	return &HealthService{
		startTime: time.Now(),
	}
}

func (s *HealthService) Check(
	ctx context.Context,
	req *messages.CheckRequest,
) (*messages.CheckResponse, error) {
	message := "Service is healthy"

	return &messages.CheckResponse{
		Message: message,
	}, nil
}

func (s *HealthService) GetUptime() time.Duration {
	return time.Since(s.startTime)
}

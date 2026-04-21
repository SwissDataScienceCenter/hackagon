package service

import (
	"context"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	messages "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health/messages"
)

type HealthService struct {
	proto.UnimplementedHealthSvcServer
	startTime time.Time
}

func NewHealthService() *HealthService {
	return &HealthService{
		startTime: time.Now(),
	}
}

func (s *HealthService) Check(
	ctx context.Context,
	req *messages.HealthCheckRequest,
) (*messages.HealthCheckResponse, error) {
	message := "Service is healthy"

	return &messages.HealthCheckResponse{
		Message: message,
	}, nil
}

func (s *HealthService) GetUptime() time.Duration {
	return time.Since(s.startTime)
}

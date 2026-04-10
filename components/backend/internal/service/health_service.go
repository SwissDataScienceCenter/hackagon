package service

import (
	"context"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
)

type HealthService struct {
	proto.UnimplementedHealthServer
	startTime time.Time
}

func NewHealthService() *HealthService {
	return &HealthService{
		startTime: time.Now(),
	}
}

func (s *HealthService) Check(
	ctx context.Context,
	req *proto.HealthCheckRequest,
) (*proto.HealthCheckResponse, error) {
	message := "Service is healthy"

	return &proto.HealthCheckResponse{
		Message: message,
	}, nil
}

func (s *HealthService) GetUptime() time.Duration {
	return time.Since(s.startTime)
}

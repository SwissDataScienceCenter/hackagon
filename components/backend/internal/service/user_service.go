package service

import (
	"context"

	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type UserService struct {
	proto.UnimplementedUserServer
	connStr string
}

func NewUserService(cfg *config.Config) *UserService {
	return &UserService{
		connStr: cfg.ConnectionStr(),
	}
}

func (s *UserService) List(
	ctx context.Context,
	req *proto.UserListRequest,
) (*proto.UserListResponse, error) {
	client, err := ent.Open(
		"postgres",
		s.connStr,
	)
	if err != nil {
		return nil, err
	}

	defer client.Close()

	users, err := client.User.Query().All(ctx)
	if err != nil {
		return nil, err
	}
	var users_out []*proto.UserEntry
	for _, v := range users {
		user := proto.UserEntry{
			Name:       v.Username,
			KeycloakId: v.KeycloakID,
			CreatedAt:  timestamppb.New(v.CreatedAt),
		}
		users_out = append(users_out, &user)
	}
	return &proto.UserListResponse{Users: users_out}, nil
}

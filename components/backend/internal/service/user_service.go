package service

import (
	"context"
	"fmt"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type UserService struct {
	proto.UnimplementedUserServer
	db_cfg config.DatabaseConfig
}

func NewUserService(cfg *config.Config) *UserService {
	return &UserService{
		db_cfg: cfg.DB,
	}
}

func (s *UserService) List(
	ctx context.Context,
	req *proto.UserListRequest,
) (*proto.UserListResponse, error) {
	client, err := ent.Open(
		"postgres",
		fmt.Sprintf(
			"host=%s port=%s user=%s dbname=%s password=%s",
			s.db_cfg.Host,
			s.db_cfg.Port,
			s.db_cfg.User,
			s.db_cfg.DbName,
			s.db_cfg.Password,
		),
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

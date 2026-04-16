package service

import (
	"context"

	"github.com/casbin/casbin/v3"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type UserService struct {
	proto.UnimplementedUserServer
	dbClient *ent.Client
	enforcer *casbin.Enforcer
}

func NewUserService(dbClient *ent.Client, enf *casbin.Enforcer) *UserService {
	return &UserService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func (s *UserService) List(
	ctx context.Context,
	req *proto.UserListRequest,
) (*proto.UserListResponse, error) {
	users, err := s.dbClient.User.Query().All(ctx)
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

package trip

import (
	"context"
	rentalpb "coolcar/rental/api/gen/v1"
	"coolcar/shared/auth"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Service struct {
	Logger *zap.Logger
	rentalpb.UnimplementedTripServiceServer
}

func (s *Service) CreateTrip(ctx context.Context, request *rentalpb.CreateTripRequest) (*rentalpb.CreateTripResponse, error) {
	// get accountID from context
	aid, err := auth.AccountIDFromContext(ctx)
	if err != nil {
		return nil, err
	}
	s.Logger.Info("create trip", zap.String("start", request.Start), zap.String("account_id", aid.String()))
	return nil, status.Errorf(codes.Unimplemented, "")
}



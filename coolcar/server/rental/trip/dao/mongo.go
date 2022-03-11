package dao

import (
	"context"
	rentalpb "coolcar/rental/api/gen/v1"
	"coolcar/shared/id"
	mgutil "coolcar/shared/mongo"
	"coolcar/shared/mongo/objid"
	"fmt"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	tripField = "trip"
	accountIDField = tripField + ".accountid"
	statusField = tripField + ".status"
)

type Mongo struct {
	col *mongo.Collection // mongo 中的表结构
}

// NewMongo 根据给出的数据库，从中获取操作的 trip 表.
func NewMongo(db *mongo.Database) *Mongo {
	return &Mongo{
		col: db.Collection("trip"),
	}
}

// TripRecord mongo 中的表字段.
type TripRecord struct {
	mgutil.IDField        `bson:"inline"`
	mgutil.UpdatedAtField `bson:"inline"` // 用于行程乐观锁的使用
	Trip                  *rentalpb.Trip  `bson:"trip"`
}


func (m *Mongo) CreateTrip(c context.Context, trip *rentalpb.Trip) (*TripRecord, error) {
	r := &TripRecord{
		Trip: trip,
	}
	r.ID = mgutil.NewObjID()
	r.UpdatedAt = mgutil.UpdatedAt()

	_, err := m.col.InsertOne(c, r)
	if err != nil {
		return nil, err
	}

	return r, nil
}


func (m *Mongo) GetTrip(c context.Context, id id.TripID, accountID id.AccountID) (*TripRecord, error) {
	objID, err := objid.FromID(id)
	if err != nil {
		return nil, fmt.Errorf("invalid id: %v", err)
	}
	res := m.col.FindOne(c, bson.M{
		// 定义查询条件
		mgutil.IDFieldName: objID,
		accountIDField: accountID.String(),
	})
	if err = res.Err(); err != nil {
		return nil, err
	}

	var tr TripRecord
	err = res.Decode(&tr)
	if err != nil {
		return nil, fmt.Errorf("cannot decode: %v\n", err)
	}

	return &tr, nil
}

// GetTrips 获取某个用户 某个状态？ 的所有行程.
func (m *Mongo) GetTrips(c context.Context, accountID id.AccountID, status rentalpb.TripStatus) ([]*TripRecord, error) {
	// 定义查找约束
	filter := bson.M{
		accountIDField: accountID.String(),
	}

	if status != rentalpb.TripStatus_TS_NOT_SPECIFIED {
		filter[statusField] = status
	}

	res, err := m.col.Find(c, filter)
	if err != nil {
		return nil, err
	}

	var tripRecords []*TripRecord
	for res.Next(c) {
		var trip TripRecord
		err := res.Decode(&trip)
		if err != nil {
			return nil, err
		}
		tripRecords = append(tripRecords, &trip)
	}
	return tripRecords, nil
}
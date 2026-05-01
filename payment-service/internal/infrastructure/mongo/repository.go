package mongo

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/modularis/payment-service/internal/core/payment"
)

type Repository struct {
	client     *mongodriver.Client
	collection *mongodriver.Collection
}

func NewRepository(client *mongodriver.Client, database string) (*Repository, error) {
	collection := client.Database(database).Collection("payments")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := collection.Indexes().CreateMany(ctx, []mongodriver.IndexModel{
		{Keys: bson.D{{Key: "idempotencyKey", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "paymentReference", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "pendingMessages.nextAttemptAt", Value: 1}}},
	}); err != nil {
		return nil, err
	}
	return &Repository{
		client:     client,
		collection: collection,
	}, nil
}

func (r *Repository) Ping(ctx context.Context) error {
	return r.client.Ping(ctx, nil)
}

func (r *Repository) FindByIdempotencyKey(ctx context.Context, idempotencyKey string) (*payment.Payment, error) {
	return r.findOne(ctx, bson.M{"idempotencyKey": idempotencyKey})
}

func (r *Repository) Create(ctx context.Context, paymentRecord *payment.Payment) (*payment.Payment, error) {
	now := time.Now().UTC()
	paymentRecord.CreatedAt = now
	paymentRecord.UpdatedAt = now
	if paymentRecord.ID == "" {
		paymentRecord.ID = uuid.NewString()
	}
	if paymentRecord.PendingMessages == nil {
		paymentRecord.PendingMessages = []payment.PendingMessage{}
	}
	if paymentRecord.WebhookEventIDs == nil {
		paymentRecord.WebhookEventIDs = []string{}
	}
	_, err := r.collection.InsertOne(ctx, paymentRecord)
	if err != nil {
		return nil, err
	}
	return paymentRecord, nil
}

func (r *Repository) FindByID(ctx context.Context, paymentID string) (*payment.Payment, error) {
	return r.findOne(ctx, bson.M{"_id": paymentID})
}

func (r *Repository) FindByReference(ctx context.Context, reference string) (*payment.Payment, error) {
	return r.findOne(ctx, bson.M{"paymentReference": reference})
}

func (r *Repository) ReserveForProcessing(ctx context.Context, paymentID string, now time.Time) (*payment.Payment, error) {
	var paymentRecord payment.Payment
	err := r.collection.FindOneAndUpdate(
		ctx,
		bson.M{
			"_id":           paymentID,
			"paymentStatus": payment.PaymentStatusPending,
			"expiresAt":     bson.M{"$gt": now},
		},
		bson.M{
			"$set": bson.M{
				"paymentStatus":        payment.PaymentStatusProcessing,
				"processingStartedAt":  now,
				"updatedAt":            now,
				"paymentFailureReason": "",
			},
			"$inc": bson.M{"processingAttempts": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&paymentRecord)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return nil, nil
	}
	return &paymentRecord, err
}

func (r *Repository) EnqueueMessages(ctx context.Context, paymentID string, messages []payment.PendingMessage) error {
	if len(messages) == 0 {
		return nil
	}
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": paymentID}, bson.M{
		"$push": bson.M{"pendingMessages": bson.M{"$each": messages}},
		"$set":  bson.M{"updatedAt": time.Now().UTC()},
	})
	return err
}

func (r *Repository) MarkFailed(ctx context.Context, paymentID string, reason string, messages []payment.PendingMessage) (*payment.Payment, bool, error) {
	return r.transitionWithMessages(ctx, bson.M{
		"_id":           paymentID,
		"paymentStatus": payment.PaymentStatusProcessing,
	}, bson.M{
		"paymentStatus":        payment.PaymentStatusFailed,
		"paymentFailureReason": reason,
		"processingStartedAt":  nil,
		"updatedAt":            time.Now().UTC(),
	}, messages)
}

func (r *Repository) MarkExpired(ctx context.Context, paymentID string, messages []payment.PendingMessage) (*payment.Payment, bool, error) {
	return r.transitionWithMessages(ctx, bson.M{
		"_id": paymentID,
		"paymentStatus": bson.M{
			"$in": bson.A{
				payment.PaymentStatusPending,
				payment.PaymentStatusProcessing,
				payment.PaymentStatusFailed,
			},
		},
	}, bson.M{
		"paymentStatus":       payment.PaymentStatusExpired,
		"processingStartedAt": nil,
		"updatedAt":           time.Now().UTC(),
	}, messages)
}

func (r *Repository) MarkCompleted(
	ctx context.Context,
	paymentID string,
	eventID string,
	confirmedAt time.Time,
	messages []payment.PendingMessage,
) (*payment.Payment, bool, error) {
	return r.transitionWithMessages(ctx, bson.M{
		"_id": paymentID,
		"paymentStatus": bson.M{
			"$in": bson.A{
				payment.PaymentStatusPending,
				payment.PaymentStatusProcessing,
				payment.PaymentStatusFailed,
			},
		},
	}, bson.M{
		"paymentStatus":        payment.PaymentStatusCompleted,
		"confirmedAt":          confirmedAt,
		"processingStartedAt":  nil,
		"paymentFailureReason": "",
		"updatedAt":            time.Now().UTC(),
	}, messages, bson.M{
		"$addToSet": bson.M{"webhookEventIds": eventID},
	})
}

func (r *Repository) MarkDelivery(
	ctx context.Context,
	paymentID string,
	status payment.DeliveryStatus,
	reason string,
	messages []payment.PendingMessage,
) (*payment.Payment, bool, error) {
	update := bson.M{
		"deliveryStatus": status,
		"updatedAt":      time.Now().UTC(),
	}
	if reason == "" {
		update["deliveryFailureReason"] = ""
	} else {
		update["deliveryFailureReason"] = reason
	}
	return r.transitionWithMessages(ctx, bson.M{
		"_id":            paymentID,
		"paymentStatus":  payment.PaymentStatusCompleted,
		"deliveryStatus": payment.DeliveryStatusPending,
	}, update, messages)
}

func (r *Repository) ClaimPendingPublishes(
	ctx context.Context,
	before time.Time,
	claimUntil time.Time,
	limit int,
) ([]payment.PendingPublish, error) {
	result := make([]payment.PendingPublish, 0, limit)
	for len(result) < limit {
		claimToken := uuid.NewString()
		var paymentRecord payment.Payment
		err := r.collection.FindOneAndUpdate(
			ctx,
			bson.M{
				"pendingMessages": bson.M{
					"$elemMatch": bson.M{
						"nextAttemptAt": bson.M{"$lte": before},
						"$or": bson.A{
							bson.M{"claimedUntil": bson.M{"$exists": false}},
							bson.M{"claimedUntil": nil},
							bson.M{"claimedUntil": bson.M{"$lte": before}},
						},
					},
				},
			},
			bson.M{
				"$set": bson.M{
					"pendingMessages.$.claimToken":   claimToken,
					"pendingMessages.$.claimedUntil": claimUntil,
					"updatedAt":                      time.Now().UTC(),
				},
			},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&paymentRecord)
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			break
		}
		if err != nil {
			return nil, err
		}

		for _, message := range paymentRecord.PendingMessages {
			if message.ClaimToken == claimToken {
				result = append(result, payment.PendingPublish{
					PaymentID: paymentRecord.ID,
					Message:   message,
				})
				break
			}
		}
	}
	return result, nil
}

func (r *Repository) AcknowledgePendingPublish(ctx context.Context, paymentID string, messageID string, claimToken string) error {
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": paymentID}, bson.M{
		"$pull": bson.M{"pendingMessages": bson.M{"id": messageID, "claimToken": claimToken}},
		"$set":  bson.M{"updatedAt": time.Now().UTC()},
	})
	return err
}

func (r *Repository) RetryPendingPublish(
	ctx context.Context,
	paymentID string,
	messageID string,
	claimToken string,
	nextAttemptAt time.Time,
	attempts int,
) error {
	_, err := r.collection.UpdateOne(ctx, bson.M{"_id": paymentID}, bson.M{
		"$set": bson.M{
			"pendingMessages.$[message].nextAttemptAt": nextAttemptAt,
			"pendingMessages.$[message].attempts":      attempts,
			"pendingMessages.$[message].claimToken":    "",
			"pendingMessages.$[message].claimedUntil":  nil,
			"updatedAt": time.Now().UTC(),
		},
	}, options.UpdateOne().SetArrayFilters([]any{bson.M{"message.id": messageID, "message.claimToken": claimToken}}))
	return err
}

func (r *Repository) transitionWithMessages(
	ctx context.Context,
	filter bson.M,
	update bson.M,
	messages []payment.PendingMessage,
	extraUpdates ...bson.M,
) (*payment.Payment, bool, error) {
	updateDocument := bson.M{"$set": update}
	if len(messages) > 0 {
		updateDocument["$push"] = bson.M{"pendingMessages": bson.M{"$each": messages}}
	}
	for _, extra := range extraUpdates {
		for operator, value := range extra {
			if existing, ok := updateDocument[operator].(bson.M); ok {
				for key, fieldValue := range value.(bson.M) {
					existing[key] = fieldValue
				}
				continue
			}
			updateDocument[operator] = value
		}
	}

	var paymentRecord payment.Payment
	err := r.collection.FindOneAndUpdate(
		ctx,
		filter,
		updateDocument,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&paymentRecord)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		current, findErr := r.findOne(ctx, bson.M{"_id": filter["_id"]})
		return current, false, findErr
	}
	return &paymentRecord, err == nil, err
}

func (r *Repository) findOne(ctx context.Context, filter bson.M) (*payment.Payment, error) {
	var paymentRecord payment.Payment
	err := r.collection.FindOne(ctx, filter).Decode(&paymentRecord)
	if errors.Is(err, mongodriver.ErrNoDocuments) {
		return nil, nil
	}
	return &paymentRecord, err
}

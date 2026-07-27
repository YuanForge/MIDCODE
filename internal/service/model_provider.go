package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

var (
	ErrModelProviderNotFound   = errors.New("model provider not found")
	ErrModelProviderConflict   = errors.New("model provider conflict")
	ErrModelProviderReferenced = errors.New("model provider is referenced")
	ErrModelProviderInactive   = errors.New("model provider is inactive")
	ErrModelProviderMismatch   = errors.New("model provider does not match existing bindings")
)

var modelProviderCodePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)

type ModelProviderSummary struct {
	ID           int64  `xorm:"id" json:"id"`
	Code         string `xorm:"code" json:"code"`
	Name         string `xorm:"name" json:"name"`
	IsActive     bool   `xorm:"is_active" json:"is_active"`
	SortOrder    int    `xorm:"sort_order" json:"sort_order"`
	GroupCount   int64  `xorm:"group_count" json:"group_count"`
	ChannelCount int64  `xorm:"channel_count" json:"channel_count"`
}

type ModelProviderReferencedError struct {
	GroupCount   int64
	ChannelCount int64
}

func (err *ModelProviderReferencedError) Error() string {
	return fmt.Sprintf("%s: group_count=%d channel_count=%d", ErrModelProviderReferenced, err.GroupCount, err.ChannelCount)
}

func (*ModelProviderReferencedError) Unwrap() error { return ErrModelProviderReferenced }

func normalizeModelProviderCode(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeModelProviderName(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func validateModelProviderInput(provider *model.ModelProvider) error {
	if provider == nil {
		return fmt.Errorf("model provider is required")
	}
	provider.Code = normalizeModelProviderCode(provider.Code)
	provider.Name = normalizeModelProviderName(provider.Name)
	if !modelProviderCodePattern.MatchString(provider.Code) {
		return fmt.Errorf("model provider code must match [a-z0-9][a-z0-9_-]*")
	}
	if provider.Name == "" {
		return fmt.Errorf("model provider name is required")
	}
	if provider.SortOrder < 0 {
		return fmt.Errorf("model provider sort order cannot be negative")
	}
	return nil
}

func providerCodeCanChange(current, requested string, groupCount, channelCount int64) error {
	if normalizeModelProviderCode(current) == normalizeModelProviderCode(requested) || groupCount+channelCount == 0 {
		return nil
	}
	return fmt.Errorf("%w: referenced model provider code cannot be changed", ErrModelProviderConflict)
}

func ListModelProviders(ctx context.Context, includeInactive bool) ([]ModelProviderSummary, error) {
	_ = ctx
	providers := make([]ModelProviderSummary, 0)
	query := db.Engine.Table("model_providers").Alias("mp").
		Select(`mp.id, mp.code, mp.name, mp.is_active, mp.sort_order,
            (SELECT COUNT(*) FROM model_groups mg WHERE mg.model_provider_id = mp.id) AS group_count,
            (SELECT COUNT(*) FROM channels c WHERE c.model_provider_id = mp.id) AS channel_count`)
	if !includeInactive {
		query = query.Where("mp.is_active = true")
	}
	if err := query.OrderBy("mp.sort_order ASC, mp.id ASC").Find(&providers); err != nil {
		return nil, err
	}
	return providers, nil
}

func GetModelProvider(ctx context.Context, id int64) (*model.ModelProvider, error) {
	_ = ctx
	provider := &model.ModelProvider{}
	found, err := db.Engine.ID(id).Get(provider)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrModelProviderNotFound
	}
	return provider, nil
}

func NextModelProviderSortOrder(ctx context.Context) (int, error) {
	_ = ctx
	var row struct {
		Value int `xorm:"value"`
	}
	if _, err := db.Engine.SQL("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM model_providers").Get(&row); err != nil {
		return 0, err
	}
	return row.Value, nil
}

func modelProviderDuplicateExists(id int64, code, name string) (bool, error) {
	query := db.Engine.Table("model_providers").
		Where("(LOWER(code) = LOWER(?) OR LOWER(BTRIM(name)) = LOWER(BTRIM(?)))", code, name)
	if id > 0 {
		query = query.And("id <> ?", id)
	}
	return query.Exist()
}

func CreateModelProvider(ctx context.Context, provider *model.ModelProvider) error {
	_ = ctx
	if err := validateModelProviderInput(provider); err != nil {
		return err
	}
	duplicate, err := modelProviderDuplicateExists(0, provider.Code, provider.Name)
	if err != nil {
		return err
	}
	if duplicate {
		return fmt.Errorf("%w: model provider code or name already exists", ErrModelProviderConflict)
	}
	if _, err = db.Engine.Insert(provider); err != nil {
		if isModelProviderConstraintConflict(err) {
			return fmt.Errorf("%w: model provider code or name already exists", ErrModelProviderConflict)
		}
		return err
	}
	return nil
}

func UpdateModelProvider(ctx context.Context, provider *model.ModelProvider) error {
	_ = ctx
	if provider == nil || provider.ID <= 0 {
		return fmt.Errorf("model provider id is required")
	}
	if err := validateModelProviderInput(provider); err != nil {
		return err
	}
	current, err := GetModelProvider(ctx, provider.ID)
	if err != nil {
		return err
	}
	counts, err := modelProviderReferenceCounts(provider.ID)
	if err != nil {
		return err
	}
	if err := providerCodeCanChange(current.Code, provider.Code, counts.GroupCount, counts.ChannelCount); err != nil {
		return err
	}
	duplicate, err := modelProviderDuplicateExists(provider.ID, provider.Code, provider.Name)
	if err != nil {
		return err
	}
	if duplicate {
		return fmt.Errorf("%w: model provider code or name already exists", ErrModelProviderConflict)
	}
	provider.IsActive = current.IsActive
	if _, err = db.Engine.ID(provider.ID).Cols("code", "name", "sort_order").Update(provider); err != nil {
		if isModelProviderConstraintConflict(err) {
			return fmt.Errorf("%w: model provider code or name already exists", ErrModelProviderConflict)
		}
		return err
	}
	return nil
}

func ToggleModelProvider(ctx context.Context, id int64, active bool) error {
	_ = ctx
	affected, err := db.Engine.ID(id).Cols("is_active").Update(&model.ModelProvider{IsActive: active})
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrModelProviderNotFound
	}
	return nil
}

func DeleteModelProvider(ctx context.Context, id int64) error {
	_ = ctx
	counts, err := modelProviderReferenceCounts(id)
	if err != nil {
		return err
	}
	if counts.GroupCount+counts.ChannelCount > 0 {
		return &ModelProviderReferencedError{GroupCount: counts.GroupCount, ChannelCount: counts.ChannelCount}
	}
	affected, err := db.Engine.ID(id).Delete(new(model.ModelProvider))
	if err != nil {
		if isModelProviderConstraintConflict(err) {
			counts, countErr := modelProviderReferenceCounts(id)
			if countErr != nil {
				return countErr
			}
			return &ModelProviderReferencedError{GroupCount: counts.GroupCount, ChannelCount: counts.ChannelCount}
		}
		return err
	}
	if affected == 0 {
		return ErrModelProviderNotFound
	}
	return nil
}

func modelProviderReferenceCounts(id int64) (ModelProviderSummary, error) {
	var counts ModelProviderSummary
	counts.ID = id
	groupCount, err := db.Engine.Where("model_provider_id = ?", id).Count(new(model.ModelGroup))
	if err != nil {
		return counts, err
	}
	channelCount, err := db.Engine.Where("model_provider_id = ?", id).Count(new(model.Channel))
	if err != nil {
		return counts, err
	}
	counts.GroupCount = groupCount
	counts.ChannelCount = channelCount
	return counts, nil
}

func isModelProviderConstraintConflict(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate key") || strings.Contains(message, "unique constraint") || strings.Contains(message, "foreign key constraint")
}

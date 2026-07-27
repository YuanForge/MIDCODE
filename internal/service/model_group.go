package service

import (
	"context"
	"fmt"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

type ModelGroupSummary struct {
	model.ModelGroup       `xorm:"extends"`
	ModelProviderActive    bool  `xorm:"model_provider_active" json:"model_provider_active"`
	ModelProviderSortOrder int   `xorm:"model_provider_sort_order" json:"model_provider_sort_order"`
	ModelCount             int64 `xorm:"model_count" json:"model_count"`
}

type ModelGroupModelView struct {
	model.ModelGroupModel
	Channel model.Channel `json:"channel"`
}

func validateModelGroupInput(group *model.ModelGroup) error {
	if group == nil {
		return fmt.Errorf("model group is required")
	}
	if strings.TrimSpace(group.Code) == "" {
		return fmt.Errorf("model group code is required")
	}
	if strings.TrimSpace(group.Name) == "" {
		return fmt.Errorf("model group name is required")
	}
	if group.ModelProviderID <= 0 {
		return fmt.Errorf("model provider id is required")
	}
	return nil
}

func validateModelGroupChannelProvider(group model.ModelGroup, channel model.Channel) error {
	if channel.ModelProviderID <= 0 {
		return fmt.Errorf("channel model provider id is required")
	}
	if group.ModelProviderID != channel.ModelProviderID {
		return fmt.Errorf("%w: model group provider %d does not match channel provider %d", ErrModelProviderMismatch, group.ModelProviderID, channel.ModelProviderID)
	}
	return nil
}

func validateRoutingModelProvider(routingModel string, existingProviderID, requestedProviderID int64) error {
	if existingProviderID == requestedProviderID {
		return nil
	}
	return fmt.Errorf("routing model %q already belongs to model provider %d", strings.TrimSpace(routingModel), existingProviderID)
}

func validateModelGroupProviderChange(providerID int64, channels []model.Channel) error {
	group := model.ModelGroup{ModelProviderID: providerID}
	for _, channel := range channels {
		if err := validateModelGroupChannelProvider(group, channel); err != nil {
			return fmt.Errorf("channel %q: %w", ChannelRoutingKey(channel), err)
		}
	}
	return nil
}

func providerSelectionAllowed(currentProviderID int64, provider model.ModelProvider) error {
	if provider.IsActive || currentProviderID == provider.ID {
		return nil
	}
	return ErrModelProviderInactive
}

func ListModelGroups(ctx context.Context, includeInactive bool) ([]ModelGroupSummary, error) {
	_ = ctx
	query := db.Engine.Table("model_groups").Alias("mg").
		Select(`mg.*, mp.name AS model_provider,
            mp.is_active AS model_provider_active,
            mp.sort_order AS model_provider_sort_order,
            (SELECT COUNT(*) FROM model_group_models mgm WHERE mgm.group_id = mg.id) AS model_count`).
		Join("INNER", "model_providers mp", "mp.id = mg.model_provider_id")
	defer query.Close()
	if !includeInactive {
		query = query.Where("mg.is_active = true AND mp.is_active = true")
	}
	var groups []ModelGroupSummary
	if err := query.OrderBy("mp.sort_order ASC, mp.id ASC, mg.id DESC").Find(&groups); err != nil {
		return nil, err
	}
	return groups, nil
}

func CreateModelGroup(ctx context.Context, group *model.ModelGroup) error {
	if err := validateModelGroupInput(group); err != nil {
		return err
	}
	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return err
	}
	var provider model.ModelProvider
	found, err := session.ID(group.ModelProviderID).Get(&provider)
	if err != nil {
		_ = session.Rollback()
		return err
	}
	if !found {
		_ = session.Rollback()
		return ErrModelProviderNotFound
	}
	if err := providerSelectionAllowed(0, provider); err != nil {
		_ = session.Rollback()
		return err
	}
	group.Code = strings.TrimSpace(group.Code)
	group.Name = strings.TrimSpace(group.Name)
	group.ModelProvider = provider.Name
	if _, err := session.Insert(group); err != nil {
		_ = session.Rollback()
		return err
	}
	return session.Commit()
}

func UpdateModelGroup(ctx context.Context, group *model.ModelGroup) error {
	if group == nil || group.ID <= 0 {
		return fmt.Errorf("model group id is required")
	}
	if err := validateModelGroupInput(group); err != nil {
		return err
	}
	group.Code = strings.TrimSpace(group.Code)
	group.Name = strings.TrimSpace(group.Name)

	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return err
	}
	rollback := func(err error) error {
		_ = session.Rollback()
		return err
	}
	var current model.ModelGroup
	found, err := session.ID(group.ID).Get(&current)
	if err != nil {
		return rollback(err)
	}
	if !found {
		return rollback(fmt.Errorf("model group not found"))
	}
	var provider model.ModelProvider
	found, err = session.ID(group.ModelProviderID).Get(&provider)
	if err != nil {
		return rollback(err)
	}
	if !found {
		return rollback(ErrModelProviderNotFound)
	}
	if err := providerSelectionAllowed(current.ModelProviderID, provider); err != nil {
		return rollback(err)
	}
	group.ModelProvider = provider.Name

	var channels []model.Channel
	if err := session.Table("channels").Alias("c").
		Join("INNER", "model_group_models mgm", "mgm.channel_id = c.id").
		Where("mgm.group_id = ?", group.ID).Find(&channels); err != nil {
		return rollback(err)
	}
	if err := validateModelGroupProviderChange(group.ModelProviderID, channels); err != nil {
		return rollback(err)
	}

	type providerConflict struct {
		RoutingModel    string `xorm:"routing_model"`
		ModelProviderID int64  `xorm:"model_provider_id"`
	}
	var conflict providerConflict
	found, err = session.Table("model_group_models").Alias("own").
		Select("own.routing_model AS routing_model, other_group.model_provider_id AS model_provider_id").
		Join("INNER", "model_group_models other", "other.routing_model = own.routing_model AND other.group_id <> own.group_id").
		Join("INNER", "model_groups other_group", "other_group.id = other.group_id").
		Where("own.group_id = ? AND other_group.model_provider_id <> ?", group.ID, group.ModelProviderID).
		Get(&conflict)
	if err != nil {
		return rollback(err)
	}
	if found {
		return rollback(validateRoutingModelProvider(conflict.RoutingModel, conflict.ModelProviderID, group.ModelProviderID))
	}

	if _, err := session.ID(group.ID).Cols("code", "name", "model_provider_id", "model_provider", "description", "is_active").Update(group); err != nil {
		return rollback(err)
	}
	return session.Commit()
}

func ToggleModelGroup(ctx context.Context, id int64, active bool) error {
	if id <= 0 {
		return fmt.Errorf("model group id is required")
	}
	_, err := db.Engine.ID(id).Cols("is_active").Update(&model.ModelGroup{IsActive: active})
	return err
}

func DeleteModelGroup(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("model group id is required")
	}
	if count, err := db.Engine.Where("group_id = ?", id).Count(new(model.APIKeyModelGroup)); err != nil {
		return err
	} else if count > 0 {
		return fmt.Errorf("model group is still bound to API keys")
	}
	if count, err := db.Engine.Where("group_id = ?", id).Count(new(model.ModelGroupModel)); err != nil {
		return err
	} else if count > 0 {
		return fmt.Errorf("model group still contains models")
	}
	_, err := db.Engine.ID(id).Delete(new(model.ModelGroup))
	return err
}

func ListModelGroupModels(ctx context.Context, groupID int64) ([]ModelGroupModelView, error) {
	_ = ctx
	var bindings []model.ModelGroupModel
	if err := db.Engine.Where("group_id = ?", groupID).OrderBy("routing_model ASC, id ASC").Find(&bindings); err != nil {
		return nil, err
	}
	result := make([]ModelGroupModelView, 0, len(bindings))
	for _, binding := range bindings {
		var channel model.Channel
		found, err := db.Engine.ID(binding.ChannelID).Get(&channel)
		if err != nil {
			return nil, err
		}
		if !found {
			continue
		}
		result = append(result, ModelGroupModelView{ModelGroupModel: binding, Channel: channel})
	}
	return result, nil
}

func BindModelGroupModel(ctx context.Context, groupID int64, channelID int64, routingModel string) (*model.ModelGroupModel, error) {
	_ = ctx
	if groupID <= 0 || channelID <= 0 {
		return nil, fmt.Errorf("group and channel are required")
	}
	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return nil, err
	}
	rollback := func(err error) (*model.ModelGroupModel, error) {
		_ = session.Rollback()
		return nil, err
	}

	var group model.ModelGroup
	if found, err := session.ID(groupID).Get(&group); err != nil {
		return rollback(err)
	} else if !found || !group.IsActive {
		return rollback(fmt.Errorf("model group is not active"))
	}
	var provider model.ModelProvider
	if found, err := session.ID(group.ModelProviderID).Get(&provider); err != nil {
		return rollback(err)
	} else if !found {
		return rollback(ErrModelProviderNotFound)
	}
	if err := providerSelectionAllowed(0, provider); err != nil {
		return rollback(err)
	}
	var channel model.Channel
	if found, err := session.ID(channelID).Get(&channel); err != nil {
		return rollback(err)
	} else if !found || !channel.IsActive {
		return rollback(fmt.Errorf("channel is not active"))
	}
	if err := validateModelGroupModel(channel, routingModel); err != nil {
		return rollback(err)
	}
	if err := validateModelGroupChannelProvider(group, channel); err != nil {
		return rollback(err)
	}
	routingModel = strings.TrimSpace(routingModel)
	type providerConflict struct {
		ModelProviderID int64 `xorm:"model_provider_id"`
	}
	var conflict providerConflict
	found, err := session.Table("model_group_models").Alias("mgm").
		Select("mg.model_provider_id AS model_provider_id").
		Join("INNER", "model_groups mg", "mg.id = mgm.group_id").
		Where("mgm.routing_model = ? AND mgm.group_id <> ? AND mg.model_provider_id <> ?", routingModel, groupID, group.ModelProviderID).
		Get(&conflict)
	if err != nil {
		return rollback(err)
	}
	if found {
		return rollback(validateRoutingModelProvider(routingModel, conflict.ModelProviderID, group.ModelProviderID))
	}

	binding := &model.ModelGroupModel{GroupID: groupID, RoutingModel: routingModel, ChannelID: channelID}
	if _, err := session.Insert(binding); err != nil {
		return rollback(err)
	}
	if err := session.Commit(); err != nil {
		return nil, err
	}
	return binding, nil
}

func UnbindModelGroupModel(ctx context.Context, groupID, bindingID int64) error {
	_ = ctx
	if groupID <= 0 || bindingID <= 0 {
		return fmt.Errorf("group and model binding are required")
	}
	_, err := db.Engine.Where("id = ? AND group_id = ?", bindingID, groupID).Delete(new(model.ModelGroupModel))
	return err
}

func normalizeModelGroupPriorities(bindings []model.APIKeyModelGroup) ([]model.APIKeyModelGroup, error) {
	seen := make(map[int64]struct{}, len(bindings))
	normalized := make([]model.APIKeyModelGroup, len(bindings))
	for i, binding := range bindings {
		if binding.GroupID <= 0 {
			return nil, fmt.Errorf("model group id must be positive")
		}
		if _, exists := seen[binding.GroupID]; exists {
			return nil, fmt.Errorf("duplicate model group: %d", binding.GroupID)
		}
		seen[binding.GroupID] = struct{}{}
		binding.Priority = i + 1
		normalized[i] = binding
	}
	return normalized, nil
}

func validateModelGroupModel(channel model.Channel, routingModel string) error {
	want := strings.TrimSpace(routingModel)
	if want == "" {
		return fmt.Errorf("routing model is required")
	}
	if got := ChannelRoutingKey(channel); got != want {
		return fmt.Errorf("routing model %q does not match channel model %q", want, got)
	}
	return nil
}

package service

import (
	"context"
	"fmt"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

type ModelGroupSummary struct {
	model.ModelGroup
	ModelCount int64 `json:"model_count"`
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
	return nil
}

func ListModelGroups(ctx context.Context, includeInactive bool) ([]ModelGroupSummary, error) {
	_ = ctx
	query := db.Engine.NewSession()
	defer query.Close()
	if !includeInactive {
		query = query.Where("is_active = true")
	}
	var groups []model.ModelGroup
	if err := query.OrderBy("id DESC").Find(&groups); err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return []ModelGroupSummary{}, nil
	}
	ids := make([]int64, 0, len(groups))
	for _, group := range groups {
		ids = append(ids, group.ID)
	}
	type countRow struct {
		GroupID int64 `xorm:"group_id"`
		Count   int64 `xorm:"count"`
	}
	var counts []countRow
	if err := db.Engine.Table("model_group_models").Select("group_id, COUNT(*) AS count").In("group_id", ids).GroupBy("group_id").Find(&counts); err != nil {
		return nil, err
	}
	countMap := make(map[int64]int64, len(counts))
	for _, row := range counts {
		countMap[row.GroupID] = row.Count
	}
	result := make([]ModelGroupSummary, 0, len(groups))
	for _, group := range groups {
		result = append(result, ModelGroupSummary{ModelGroup: group, ModelCount: countMap[group.ID]})
	}
	return result, nil
}

func CreateModelGroup(ctx context.Context, group *model.ModelGroup) error {
	if err := validateModelGroupInput(group); err != nil {
		return err
	}
	group.Code = strings.TrimSpace(group.Code)
	group.Name = strings.TrimSpace(group.Name)
	_, err := db.Engine.Insert(group)
	return err
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
	_, err := db.Engine.ID(group.ID).AllCols().Update(group)
	return err
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
	var group model.ModelGroup
	if found, err := db.Engine.ID(groupID).Get(&group); err != nil {
		return nil, err
	} else if !found || !group.IsActive {
		return nil, fmt.Errorf("model group is not active")
	}
	var channel model.Channel
	if found, err := db.Engine.ID(channelID).Get(&channel); err != nil {
		return nil, err
	} else if !found || !channel.IsActive {
		return nil, fmt.Errorf("channel is not active")
	}
	if err := validateModelGroupModel(channel, routingModel); err != nil {
		return nil, err
	}
	binding := &model.ModelGroupModel{GroupID: groupID, RoutingModel: strings.TrimSpace(routingModel), ChannelID: channelID}
	if _, err := db.Engine.Insert(binding); err != nil {
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

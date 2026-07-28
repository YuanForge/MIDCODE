package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"xorm.io/xorm"
)

type APIKeyModelGroupView struct {
	ID       int64             `json:"id"`
	APIKeyID int64             `json:"api_key_id"`
	GroupID  int64             `json:"group_id"`
	Priority int               `json:"priority"`
	Group    ModelGroupSummary `json:"group"`
}

type apiKeyGroupProviderState struct {
	GroupID        int64 `xorm:"group_id"`
	ProviderID     int64 `xorm:"provider_id"`
	ProviderActive bool  `xorm:"provider_active"`
	GroupActive    bool  `xorm:"group_active"`
}

func validateDisabledProviderBindings(current, requested []apiKeyGroupProviderState) error {
	disabledProviders := make(map[int64]struct{})
	for _, state := range current {
		if !state.ProviderActive {
			disabledProviders[state.ProviderID] = struct{}{}
		}
	}
	for _, state := range requested {
		if !state.ProviderActive {
			disabledProviders[state.ProviderID] = struct{}{}
		}
	}
	for providerID := range disabledProviders {
		currentIDs := providerGroupSequence(current, providerID)
		requestedIDs := providerGroupSequence(requested, providerID)
		if len(currentIDs) != len(requestedIDs) {
			return fmt.Errorf("bindings for disabled model provider %d must remain unchanged", providerID)
		}
		for index := range currentIDs {
			if currentIDs[index] != requestedIDs[index] {
				return fmt.Errorf("bindings for disabled model provider %d must remain unchanged", providerID)
			}
		}
	}
	return nil
}

func providerGroupSequence(states []apiKeyGroupProviderState, providerID int64) []int64 {
	ids := make([]int64, 0)
	for _, state := range states {
		if state.ProviderID == providerID {
			ids = append(ids, state.GroupID)
		}
	}
	return ids
}

func validateAPIKeyGroupSelection(groupIDs []int64) error {
	if len(groupIDs) == 0 {
		return fmt.Errorf("at least one model group is required")
	}
	return nil
}

func ListAvailableAPIKeyModelGroups(ctx context.Context) ([]ModelGroupSummary, error) {
	groups, err := ListModelGroups(ctx, false)
	if err != nil {
		return nil, err
	}
	if err := enrichModelGroupOfficialDiscounts(ctx, groups); err != nil {
		return nil, err
	}
	return groups, nil
}

func ListAPIKeyModelGroups(ctx context.Context, userID, keyID int64) ([]APIKeyModelGroupView, error) {
	if !apiKeyBelongsToUser(keyID, userID) {
		return nil, fmt.Errorf("api key not found")
	}
	var bindings []model.APIKeyModelGroup
	if err := db.Engine.Where("api_key_id = ?", keyID).Asc("priority").Asc("id").Find(&bindings); err != nil {
		return nil, err
	}
	groups, err := ListModelGroups(ctx, true)
	if err != nil {
		return nil, err
	}
	groupMap := make(map[int64]ModelGroupSummary, len(groups))
	for _, group := range groups {
		groupMap[group.ID] = group
	}
	selectedGroups := make([]ModelGroupSummary, 0, len(bindings))
	selectedBindings := make([]model.APIKeyModelGroup, 0, len(bindings))
	for _, binding := range bindings {
		group, exists := groupMap[binding.GroupID]
		if !exists {
			continue
		}
		selectedGroups = append(selectedGroups, group)
		selectedBindings = append(selectedBindings, binding)
	}
	if err := enrichModelGroupOfficialDiscounts(ctx, selectedGroups); err != nil {
		return nil, err
	}
	result := make([]APIKeyModelGroupView, 0, len(selectedGroups))
	for index, group := range selectedGroups {
		binding := selectedBindings[index]
		result = append(result, APIKeyModelGroupView{
			ID: binding.ID, APIKeyID: binding.APIKeyID, GroupID: binding.GroupID,
			Priority: binding.Priority, Group: group,
		})
	}
	return result, nil
}

func ReplaceAPIKeyModelGroups(ctx context.Context, userID, keyID int64, groupIDs []int64) error {
	if err := validateAPIKeyGroupSelection(groupIDs); err != nil {
		return err
	}
	bindings := make([]model.APIKeyModelGroup, len(groupIDs))
	for i, groupID := range groupIDs {
		bindings[i] = model.APIKeyModelGroup{APIKeyID: keyID, GroupID: groupID}
	}
	normalized, err := normalizeModelGroupPriorities(bindings)
	if err != nil {
		return err
	}
	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return err
	}
	rollback := func(err error) error {
		_ = session.Rollback()
		return err
	}
	found, err := session.Where("id = ? AND user_id = ?", keyID, userID).Get(new(model.APIKey))
	if err != nil {
		return rollback(err)
	}
	if !found {
		return rollback(fmt.Errorf("api key not found"))
	}
	current, err := loadAPIKeyGroupProviderStates(session, keyID)
	if err != nil {
		return rollback(err)
	}
	requested, err := loadRequestedGroupProviderStates(session, groupIDs)
	if err != nil {
		return rollback(err)
	}
	if err := validateDisabledProviderBindings(current, requested); err != nil {
		return rollback(err)
	}
	for _, state := range requested {
		if state.ProviderActive && !state.GroupActive {
			return rollback(fmt.Errorf("one or more model groups are missing or inactive"))
		}
	}
	if _, err := session.Where("api_key_id = ?", keyID).Delete(new(model.APIKeyModelGroup)); err != nil {
		return rollback(err)
	}
	for _, binding := range normalized {
		if _, err := session.Insert(&binding); err != nil {
			return rollback(err)
		}
	}
	if err := session.Commit(); err != nil {
		return err
	}
	return nil
}

func loadAPIKeyGroupProviderStates(session *xorm.Session, keyID int64) ([]apiKeyGroupProviderState, error) {
	states := make([]apiKeyGroupProviderState, 0)
	err := session.Table("api_key_model_groups").Alias("akmg").
		Select("akmg.group_id AS group_id, mg.model_provider_id AS provider_id, mp.is_active AS provider_active, mg.is_active AS group_active").
		Join("INNER", "model_groups mg", "mg.id = akmg.group_id").
		Join("INNER", "model_providers mp", "mp.id = mg.model_provider_id").
		Where("akmg.api_key_id = ?", keyID).
		OrderBy("akmg.priority ASC, akmg.id ASC").Find(&states)
	return states, err
}

func loadRequestedGroupProviderStates(session *xorm.Session, groupIDs []int64) ([]apiKeyGroupProviderState, error) {
	var rows []apiKeyGroupProviderState
	if err := session.Table("model_groups").Alias("mg").
		Select("mg.id AS group_id, mg.model_provider_id AS provider_id, mp.is_active AS provider_active, mg.is_active AS group_active").
		Join("INNER", "model_providers mp", "mp.id = mg.model_provider_id").
		In("mg.id", groupIDs).Find(&rows); err != nil {
		return nil, err
	}
	if len(rows) != len(groupIDs) {
		return nil, fmt.Errorf("one or more model groups are missing")
	}
	byID := make(map[int64]apiKeyGroupProviderState, len(rows))
	for _, row := range rows {
		byID[row.GroupID] = row
	}
	ordered := make([]apiKeyGroupProviderState, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		state, exists := byID[groupID]
		if !exists {
			return nil, fmt.Errorf("model group %d is missing", groupID)
		}
		ordered = append(ordered, state)
	}
	return ordered, nil
}

func LoadAPIKeyModelGroupBindings(ctx context.Context, keyID int64) ([]model.APIKeyModelGroup, error) {
	_ = ctx
	var bindings []model.APIKeyModelGroup
	err := db.Engine.Where("api_key_id = ?", keyID).Asc("priority").Asc("id").Find(&bindings)
	return bindings, err
}

func CreateAPIKeyWithGroups(ctx context.Context, userID int64, name string, groupIDs []int64, secret string) (string, error) {
	if err := validateAPIKeyGroupSelection(groupIDs); err != nil {
		return "", err
	}
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("api key name is required")
	}
	bindings := make([]model.APIKeyModelGroup, len(groupIDs))
	for i, groupID := range groupIDs {
		bindings[i] = model.APIKeyModelGroup{GroupID: groupID}
	}
	normalized, err := normalizeModelGroupPriorities(bindings)
	if err != nil {
		return "", err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	rawHex := hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(rawHex))
	rawKeyEnc, err := encryptAPIKey(rawHex, secret)
	if err != nil {
		return "", err
	}
	apiKey := &model.APIKey{UserID: userID, KeyHash: hex.EncodeToString(hash[:]), RawKeyEnc: rawKeyEnc, Name: strings.TrimSpace(name), KeyType: "", IsActive: true}
	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return "", err
	}
	rollback := func(err error) (string, error) {
		_ = session.Rollback()
		return "", err
	}
	states, err := loadRequestedGroupProviderStates(session, groupIDs)
	if err != nil {
		return rollback(err)
	}
	for _, state := range states {
		if !state.ProviderActive || !state.GroupActive {
			return rollback(fmt.Errorf("one or more model groups or providers are inactive"))
		}
	}
	if _, err := session.Insert(apiKey); err != nil {
		return rollback(err)
	}
	for i := range normalized {
		normalized[i].APIKeyID = apiKey.ID
		if _, err := session.Insert(&normalized[i]); err != nil {
			return rollback(err)
		}
	}
	if err := session.Commit(); err != nil {
		return "", err
	}
	return rawHex, nil
}

func apiKeyBelongsToUser(keyID, userID int64) bool {
	if keyID <= 0 || userID <= 0 {
		return false
	}
	found, _ := db.Engine.Where("id = ? AND user_id = ?", keyID, userID).Get(new(model.APIKey))
	return found
}

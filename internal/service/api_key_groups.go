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
)

type APIKeyModelGroupView struct {
	ID       int64             `json:"id"`
	APIKeyID int64             `json:"api_key_id"`
	GroupID  int64             `json:"group_id"`
	Priority int               `json:"priority"`
	Group    ModelGroupSummary `json:"group"`
}

func validateAPIKeyGroupSelection(groupIDs []int64) error {
	if len(groupIDs) == 0 {
		return fmt.Errorf("at least one model group is required")
	}
	return nil
}

func ListAvailableAPIKeyModelGroups(ctx context.Context) ([]ModelGroupSummary, error) {
	return ListModelGroups(ctx, false)
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
	result := make([]APIKeyModelGroupView, 0, len(bindings))
	for _, binding := range bindings {
		group, exists := groupMap[binding.GroupID]
		if !exists {
			continue
		}
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
	if !apiKeyBelongsToUser(keyID, userID) {
		return fmt.Errorf("api key not found")
	}
	bindings := make([]model.APIKeyModelGroup, len(groupIDs))
	for i, groupID := range groupIDs {
		bindings[i] = model.APIKeyModelGroup{APIKeyID: keyID, GroupID: groupID}
	}
	normalized, err := normalizeModelGroupPriorities(bindings)
	if err != nil {
		return err
	}
	var groups []model.ModelGroup
	if err := db.Engine.In("id", groupIDs).Where("is_active = true").Find(&groups); err != nil {
		return err
	}
	if len(groups) != len(groupIDs) {
		return fmt.Errorf("one or more model groups are missing or inactive")
	}
	session := db.Engine.NewSession()
	defer session.Close()
	if err := session.Begin(); err != nil {
		return err
	}
	if _, err := session.Where("api_key_id = ?", keyID).Delete(new(model.APIKeyModelGroup)); err != nil {
		session.Rollback()
		return err
	}
	for _, binding := range normalized {
		if _, err := session.Insert(&binding); err != nil {
			session.Rollback()
			return err
		}
	}
	if err := session.Commit(); err != nil {
		return err
	}
	return nil
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
	var groups []model.ModelGroup
	if err := db.Engine.In("id", groupIDs).Where("is_active = true").Find(&groups); err != nil {
		return "", err
	}
	if len(groups) != len(groupIDs) {
		return "", fmt.Errorf("one or more model groups are missing or inactive")
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
	if _, err := session.Insert(apiKey); err != nil {
		session.Rollback()
		return "", err
	}
	bindings := make([]model.APIKeyModelGroup, len(groupIDs))
	for i, groupID := range groupIDs {
		bindings[i] = model.APIKeyModelGroup{APIKeyID: apiKey.ID, GroupID: groupID, Priority: i + 1}
		if _, err := session.Insert(&bindings[i]); err != nil {
			session.Rollback()
			return "", err
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

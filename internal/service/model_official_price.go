package service

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"xorm.io/xorm"
)

const officialPriceCreditsPerCNY = int64(1_000_000)

var officialPriceFields = map[string]map[string]struct{}{
	"token": {
		"input_price_per_1m_tokens":          {},
		"output_price_per_1m_tokens":         {},
		"cache_creation_price_per_1m_tokens": {},
		"cache_read_price_per_1m_tokens":     {},
	},
	"image": {
		"base_price":         {},
		"default_size_price": {},
		"size_prices":        {},
	},
	"video": {"price_per_second": {}},
	"audio": {"price_per_second": {}},
	"count": {"price_per_call": {}},
}

var officialImageSizes = map[string]struct{}{
	"1k": {},
	"2k": {},
	"3k": {},
	"4k": {},
}

var (
	ErrModelOfficialPriceInvalid                 = errors.New("model official price is invalid")
	ErrModelOfficialPriceNotFound                = errors.New("model official price not found")
	ErrModelOfficialPriceProviderNotFound        = errors.New("model official price provider not found")
	ErrModelOfficialPriceConflict                = errors.New("model official price conflict")
	ErrModelOfficialPriceExchangeRateUnavailable = errors.New("automatic USD/CNY exchange rate is unavailable")
)

type CreateModelOfficialPriceInput struct {
	ModelProviderID   int64      `json:"model_provider_id"`
	ModelName         string     `json:"model_name"`
	BillingType       string     `json:"billing_type"`
	Currency          string     `json:"currency"`
	SourcePriceConfig model.JSON `json:"source_price_config"`
}

type UpdateModelOfficialPriceInput = CreateModelOfficialPriceInput

type ModelOfficialPriceListFilter struct {
	Page            int
	Size            int
	ModelProviderID int64
	ModelName       string
	BillingType     string
	IsActive        *bool
}

type ModelOfficialPriceSummary struct {
	ID                    int64      `xorm:"id" json:"id"`
	ModelProviderID       int64      `xorm:"model_provider_id" json:"model_provider_id"`
	ModelProviderCode     string     `xorm:"model_provider_code" json:"model_provider_code"`
	ModelProviderName     string     `xorm:"model_provider_name" json:"model_provider_name"`
	ModelName             string     `xorm:"model_name" json:"model_name"`
	BillingType           string     `xorm:"billing_type" json:"billing_type"`
	Currency              string     `xorm:"currency" json:"currency"`
	SourcePriceConfig     model.JSON `xorm:"source_price_config" json:"source_price_config"`
	NormalizedPriceConfig model.JSON `xorm:"normalized_price_config" json:"normalized_price_config"`
	ExchangeRateUsed      string     `xorm:"exchange_rate_used" json:"exchange_rate_used"`
	ExchangeRateDate      string     `xorm:"exchange_rate_date" json:"exchange_rate_date"`
	IsActive              bool       `xorm:"is_active" json:"is_active"`
	CreatedAt             time.Time  `xorm:"created_at" json:"created_at"`
	UpdatedAt             time.Time  `xorm:"updated_at" json:"updated_at"`
}

type USDCNYExchangeRateStatus struct {
	Value         string `json:"value"`
	Source        string `json:"source"`
	Date          string `json:"date"`
	SyncedAt      string `json:"synced_at"`
	LastAttemptAt string `json:"last_attempt_at"`
	LastError     string `json:"last_error"`
	Available     bool   `json:"available"`
}

type modelOfficialPriceKey struct {
	ModelProviderID int64
	ModelName       string
	BillingType     string
}

type supplementalOfficialPrice struct {
	Currency              string
	NormalizedPriceConfig model.JSON
}

type supplementalOfficialPrices map[modelOfficialPriceKey]supplementalOfficialPrice

func loadActiveSupplementalOfficialPrices(ctx context.Context, providerIDs []int64) (supplementalOfficialPrices, error) {
	if len(providerIDs) == 0 {
		return supplementalOfficialPrices{}, nil
	}
	var rows []model.ModelOfficialPrice
	if err := db.Engine.Context(ctx).Where("is_active = ?", true).In("model_provider_id", providerIDs).Find(&rows); err != nil {
		return nil, err
	}
	return buildSupplementalOfficialPrices(rows), nil
}

func buildSupplementalOfficialPrices(rows []model.ModelOfficialPrice) supplementalOfficialPrices {
	prices := make(supplementalOfficialPrices, len(rows))
	for _, row := range rows {
		modelName := strings.TrimSpace(row.ModelName)
		if !row.IsActive || row.ModelProviderID <= 0 || modelName == "" {
			continue
		}
		prices[modelOfficialPriceKey{
			ModelProviderID: row.ModelProviderID,
			ModelName:       modelName,
			BillingType:     row.BillingType,
		}] = supplementalOfficialPrice{
			Currency:              row.Currency,
			NormalizedPriceConfig: row.NormalizedPriceConfig,
		}
	}
	return prices
}

func validateModelOfficialPriceInput(input CreateModelOfficialPriceInput) error {
	_, err := normalizeModelOfficialPriceInput(input)
	return err
}

func normalizeModelOfficialPriceInput(input CreateModelOfficialPriceInput) (CreateModelOfficialPriceInput, error) {
	if input.ModelProviderID <= 0 {
		return input, ErrModelOfficialPriceProviderNotFound
	}
	input.ModelName = strings.TrimSpace(input.ModelName)
	if input.ModelName == "" {
		return input, fmt.Errorf("%w: model name is required", ErrModelOfficialPriceInvalid)
	}
	validationRate := ""
	if input.Currency == "USD" {
		validationRate = "1"
	}
	if _, err := NormalizeOfficialPriceConfig(input.Currency, input.BillingType, input.SourcePriceConfig, validationRate); err != nil {
		return input, fmt.Errorf("%w: %v", ErrModelOfficialPriceInvalid, err)
	}
	return input, nil
}

func CreateModelOfficialPrice(ctx context.Context, input CreateModelOfficialPriceInput) (_ *model.ModelOfficialPrice, err error) {
	return runModelOfficialPriceTransaction(ctx, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return CreateModelOfficialPriceTx(session, input)
	})
}

func CreateModelOfficialPriceTx(session *xorm.Session, input CreateModelOfficialPriceInput) (*model.ModelOfficialPrice, error) {
	var err error
	input, err = normalizeModelOfficialPriceInput(input)
	if err != nil {
		return nil, err
	}
	if err = requireModelOfficialPriceProvider(session, input.ModelProviderID); err != nil {
		return nil, err
	}
	normalized, rate, rateDate, err := normalizeModelOfficialPriceInSession(session, input)
	if err != nil {
		return nil, err
	}
	price := &model.ModelOfficialPrice{
		ModelProviderID:       input.ModelProviderID,
		ModelName:             input.ModelName,
		BillingType:           input.BillingType,
		Currency:              input.Currency,
		SourcePriceConfig:     input.SourcePriceConfig,
		NormalizedPriceConfig: normalized,
		ExchangeRateUsed:      rate,
		ExchangeRateDate:      rateDate,
		IsActive:              true,
	}
	if _, err = session.Insert(price); err != nil {
		if isModelOfficialPriceConflict(err) {
			return nil, fmt.Errorf("%w: provider, model and billing type already exist", ErrModelOfficialPriceConflict)
		}
		return nil, err
	}
	return price, nil
}

func UpdateModelOfficialPrice(ctx context.Context, id int64, input UpdateModelOfficialPriceInput) (_ *model.ModelOfficialPrice, err error) {
	return runModelOfficialPriceTransaction(ctx, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return UpdateModelOfficialPriceTx(session, id, input)
	})
}

func UpdateModelOfficialPriceTx(session *xorm.Session, id int64, input UpdateModelOfficialPriceInput) (*model.ModelOfficialPrice, error) {
	if id <= 0 {
		return nil, ErrModelOfficialPriceNotFound
	}
	input, err := normalizeModelOfficialPriceInput(input)
	if err != nil {
		return nil, err
	}
	current := &model.ModelOfficialPrice{}
	found, err := session.ID(id).Get(current)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrModelOfficialPriceNotFound
	}
	if err = requireModelOfficialPriceProvider(session, input.ModelProviderID); err != nil {
		return nil, err
	}
	normalized, rate, rateDate, err := normalizeModelOfficialPriceInSession(session, input)
	if err != nil {
		return nil, err
	}
	current.ModelProviderID = input.ModelProviderID
	current.ModelName = input.ModelName
	current.BillingType = input.BillingType
	current.Currency = input.Currency
	current.SourcePriceConfig = input.SourcePriceConfig
	current.NormalizedPriceConfig = normalized
	current.ExchangeRateUsed = rate
	current.ExchangeRateDate = rateDate
	if _, err = session.ID(id).Cols(
		"model_provider_id", "model_name", "billing_type", "currency",
		"source_price_config", "normalized_price_config", "exchange_rate_used", "exchange_rate_date",
	).Update(current); err != nil {
		if isModelOfficialPriceConflict(err) {
			return nil, fmt.Errorf("%w: provider, model and billing type already exist", ErrModelOfficialPriceConflict)
		}
		return nil, err
	}
	return current, nil
}

func SetModelOfficialPriceStatus(ctx context.Context, id int64, active bool) (*model.ModelOfficialPrice, error) {
	return runModelOfficialPriceTransaction(ctx, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return SetModelOfficialPriceStatusTx(session, id, active)
	})
}

func SetModelOfficialPriceStatusTx(session *xorm.Session, id int64, active bool) (*model.ModelOfficialPrice, error) {
	price, err := getModelOfficialPriceInSession(session, id)
	if err != nil {
		return nil, err
	}
	affected, err := session.ID(id).Cols("is_active").Update(&model.ModelOfficialPrice{IsActive: active})
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, ErrModelOfficialPriceNotFound
	}
	price.IsActive = active
	return price, nil
}

func DeleteModelOfficialPrice(ctx context.Context, id int64) (*model.ModelOfficialPrice, error) {
	return runModelOfficialPriceTransaction(ctx, func(session *xorm.Session) (*model.ModelOfficialPrice, error) {
		return DeleteModelOfficialPriceTx(session, id)
	})
}

func DeleteModelOfficialPriceTx(session *xorm.Session, id int64) (*model.ModelOfficialPrice, error) {
	price, err := getModelOfficialPriceInSession(session, id)
	if err != nil {
		return nil, err
	}
	affected, err := session.ID(id).Delete(new(model.ModelOfficialPrice))
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, ErrModelOfficialPriceNotFound
	}
	return price, nil
}

func GetModelOfficialPrice(ctx context.Context, id int64) (*model.ModelOfficialPrice, error) {
	return getModelOfficialPriceInSession(db.Engine.Context(ctx), id)
}

func getModelOfficialPriceInSession(session *xorm.Session, id int64) (*model.ModelOfficialPrice, error) {
	if id <= 0 {
		return nil, ErrModelOfficialPriceNotFound
	}
	price := &model.ModelOfficialPrice{}
	found, err := session.ID(id).Get(price)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrModelOfficialPriceNotFound
	}
	return price, nil
}

func ListModelOfficialPrices(ctx context.Context, filter ModelOfficialPriceListFilter) ([]ModelOfficialPriceSummary, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Size < 1 || filter.Size > 100 {
		filter.Size = 20
	}
	countQuery := applyModelOfficialPriceListFilter(db.Engine.Context(ctx).Table("model_official_prices").Alias("mop"), filter)
	total, err := countQuery.Count(new(model.ModelOfficialPrice))
	if err != nil {
		return nil, 0, err
	}
	rows := make([]ModelOfficialPriceSummary, 0)
	query := applyModelOfficialPriceListFilter(db.Engine.Context(ctx).Table("model_official_prices").Alias("mop"), filter).
		Join("INNER", "model_providers mp", "mp.id = mop.model_provider_id").
		Select("mop.*, mp.code AS model_provider_code, mp.name AS model_provider_name").
		OrderBy("mop.updated_at DESC, mop.id DESC").
		Limit(filter.Size, (filter.Page-1)*filter.Size)
	if err := query.Find(&rows); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func GetUSDCNYExchangeRateStatus(ctx context.Context) (USDCNYExchangeRateStatus, error) {
	keys := []string{
		USDCNYExchangeRateSettingKey,
		USDCNYExchangeRateSourceSettingKey,
		USDCNYExchangeRateDateSettingKey,
		USDCNYExchangeRateSyncedAtSettingKey,
		USDCNYExchangeRateLastAttemptSettingKey,
		USDCNYExchangeRateLastErrorSettingKey,
	}
	var rows []model.SystemSetting
	if err := db.Engine.Context(ctx).In("key", keys).Find(&rows); err != nil {
		return USDCNYExchangeRateStatus{}, err
	}
	settings := make(map[string]string, len(rows))
	for _, row := range rows {
		settings[row.Key] = row.Value
	}
	_, available := parseAutomaticUSDCNYExchangeRate(settings)
	return USDCNYExchangeRateStatus{
		Value:         settings[USDCNYExchangeRateSettingKey],
		Source:        settings[USDCNYExchangeRateSourceSettingKey],
		Date:          settings[USDCNYExchangeRateDateSettingKey],
		SyncedAt:      settings[USDCNYExchangeRateSyncedAtSettingKey],
		LastAttemptAt: settings[USDCNYExchangeRateLastAttemptSettingKey],
		LastError:     settings[USDCNYExchangeRateLastErrorSettingKey],
		Available:     available,
	}, nil
}

func applyModelOfficialPriceListFilter(query *xorm.Session, filter ModelOfficialPriceListFilter) *xorm.Session {
	if filter.ModelProviderID > 0 {
		query = query.Where("mop.model_provider_id = ?", filter.ModelProviderID)
	}
	if modelName := strings.TrimSpace(filter.ModelName); modelName != "" {
		query = query.Where("LOWER(mop.model_name) LIKE LOWER(?)", "%"+modelName+"%")
	}
	if filter.BillingType != "" {
		query = query.Where("mop.billing_type = ?", filter.BillingType)
	}
	if filter.IsActive != nil {
		query = query.Where("mop.is_active = ?", *filter.IsActive)
	}
	return query
}

func requireModelOfficialPriceProvider(session *xorm.Session, providerID int64) error {
	found, err := session.ID(providerID).Exist(new(model.ModelProvider))
	if err != nil {
		return err
	}
	if !found {
		return ErrModelOfficialPriceProviderNotFound
	}
	return nil
}

func normalizeModelOfficialPriceInSession(session *xorm.Session, input CreateModelOfficialPriceInput) (model.JSON, string, string, error) {
	rate, rateDate := "", ""
	if input.Currency == "USD" {
		found, err := lockUSDCNYExchangeRateSetting(session, false)
		if err != nil {
			return nil, "", "", err
		}
		if !found {
			return nil, "", "", ErrModelOfficialPriceExchangeRateUnavailable
		}
		settings, err := loadUSDCNYExchangeRateSettings(session)
		if err != nil {
			return nil, "", "", err
		}
		if _, ok := parseAutomaticUSDCNYExchangeRate(settings); !ok {
			return nil, "", "", ErrModelOfficialPriceExchangeRateUnavailable
		}
		rate = settings[USDCNYExchangeRateSettingKey]
		rateDate = settings[USDCNYExchangeRateDateSettingKey]
	}
	normalized, err := NormalizeOfficialPriceConfig(input.Currency, input.BillingType, input.SourcePriceConfig, rate)
	if err != nil {
		return nil, "", "", fmt.Errorf("%w: %v", ErrModelOfficialPriceInvalid, err)
	}
	return normalized, rate, rateDate, nil
}

func rollbackSessionOnError(session *xorm.Session, err *error) {
	if *err != nil {
		_ = session.Rollback()
	}
}

func runModelOfficialPriceTransaction(ctx context.Context, mutate func(*xorm.Session) (*model.ModelOfficialPrice, error)) (_ *model.ModelOfficialPrice, err error) {
	session := db.Engine.NewSession().Context(ctx)
	defer session.Close()
	if err = session.Begin(); err != nil {
		return nil, err
	}
	defer rollbackSessionOnError(session, &err)
	price, err := mutate(session)
	if err != nil {
		return nil, err
	}
	if err = session.Commit(); err != nil {
		return nil, err
	}
	return price, nil
}

func isModelOfficialPriceConflict(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "sqlstate 23505") || strings.Contains(message, "duplicate key") || strings.Contains(message, "unique constraint")
}

// NormalizeOfficialPriceConfig validates source quotes and converts them to credits.
func NormalizeOfficialPriceConfig(currency, billingType string, source model.JSON, usdCNYRate string) (model.JSON, error) {
	allowedFields, ok := officialPriceFields[billingType]
	if !ok {
		return nil, fmt.Errorf("unsupported billing type %q", billingType)
	}

	multiplier := new(big.Rat).SetInt64(officialPriceCreditsPerCNY)
	switch currency {
	case "CNY":
	case "USD":
		rate, err := parsePositiveOfficialPriceDecimal(usdCNYRate)
		if err != nil {
			return nil, fmt.Errorf("invalid USD/CNY exchange rate: %w", err)
		}
		multiplier.Mul(multiplier, rate)
	default:
		return nil, fmt.Errorf("unsupported currency %q", currency)
	}

	normalized := make(model.JSON, len(source))
	provided := 0
	for field, raw := range source {
		if _, ok := allowedFields[field]; !ok {
			return nil, fmt.Errorf("field %q is invalid for billing type %q", field, billingType)
		}
		if field == "size_prices" {
			sizes, err := normalizeOfficialImageSizes(raw, multiplier)
			if err != nil {
				return nil, err
			}
			normalized[field] = sizes
			provided += len(sizes)
			continue
		}
		credits, err := normalizeOfficialPriceValue(field, raw, multiplier)
		if err != nil {
			return nil, err
		}
		normalized[field] = credits
		provided++
	}
	if provided == 0 {
		return nil, fmt.Errorf("at least one official price is required")
	}
	return normalized, nil
}

func normalizeOfficialImageSizes(raw interface{}, multiplier *big.Rat) (map[string]interface{}, error) {
	var source map[string]interface{}
	switch value := raw.(type) {
	case map[string]interface{}:
		source = value
	case model.JSON:
		source = map[string]interface{}(value)
	default:
		return nil, fmt.Errorf("field %q must be an object", "size_prices")
	}

	normalized := make(map[string]interface{}, len(source))
	for size, value := range source {
		if _, ok := officialImageSizes[size]; !ok {
			return nil, fmt.Errorf("unsupported image size %q", size)
		}
		credits, err := normalizeOfficialPriceValue("size_prices."+size, value, multiplier)
		if err != nil {
			return nil, err
		}
		normalized[size] = credits
	}
	return normalized, nil
}

func normalizeOfficialPriceValue(field string, raw interface{}, multiplier *big.Rat) (int64, error) {
	value, ok := raw.(string)
	if !ok {
		return 0, fmt.Errorf("field %q must be a decimal string", field)
	}
	price, err := parsePositiveOfficialPriceDecimal(value)
	if err != nil {
		return 0, fmt.Errorf("invalid field %q: %w", field, err)
	}
	return roundPositiveRatToInt64(new(big.Rat).Mul(price, multiplier))
}

func parsePositiveOfficialPriceDecimal(value string) (*big.Rat, error) {
	if value == "" || strings.TrimSpace(value) != value {
		return nil, fmt.Errorf("must be a decimal string without surrounding whitespace")
	}
	dot := false
	digits := 0
	for _, char := range value {
		switch {
		case char >= '0' && char <= '9':
			digits++
		case char == '.' && !dot:
			dot = true
		default:
			return nil, fmt.Errorf("must be a decimal string")
		}
	}
	if digits == 0 {
		return nil, fmt.Errorf("must be a decimal string")
	}
	parsed, ok := new(big.Rat).SetString(value)
	if !ok || parsed.Sign() <= 0 {
		return nil, fmt.Errorf("must be greater than zero")
	}
	return parsed, nil
}

func roundPositiveRatToInt64(value *big.Rat) (int64, error) {
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(value.Num(), value.Denom(), remainder)
	if new(big.Int).Lsh(remainder, 1).Cmp(value.Denom()) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsInt64() {
		return 0, fmt.Errorf("normalized price overflows int64")
	}
	return quotient.Int64(), nil
}

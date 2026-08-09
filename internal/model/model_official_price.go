package model

import "time"

// ModelOfficialPrice stores supplemental official prices normalized to credits.
type ModelOfficialPrice struct {
	ID                    int64     `xorm:"pk autoincr 'id'" json:"id"`
	ModelProviderID       int64     `xorm:"notnull unique(uq_model_official_prices_provider_model_type) index(idx_model_official_prices_lookup) 'model_provider_id'" json:"model_provider_id"`
	ModelName             string    `xorm:"varchar(255) notnull unique(uq_model_official_prices_provider_model_type) index(idx_model_official_prices_lookup) 'model_name'" json:"model_name"`
	BillingType           string    `xorm:"varchar(16) notnull unique(uq_model_official_prices_provider_model_type) index(idx_model_official_prices_lookup) 'billing_type'" json:"billing_type"`
	Currency              string    `xorm:"varchar(3) notnull 'currency'" json:"currency"`
	SourcePriceConfig     JSON      `xorm:"jsonb notnull default('{}') 'source_price_config'" json:"source_price_config"`
	NormalizedPriceConfig JSON      `xorm:"jsonb notnull default('{}') 'normalized_price_config'" json:"normalized_price_config"`
	ExchangeRateUsed      string    `xorm:"varchar(64) notnull default('') 'exchange_rate_used'" json:"exchange_rate_used"`
	ExchangeRateDate      string    `xorm:"varchar(32) notnull default('') 'exchange_rate_date'" json:"exchange_rate_date"`
	IsActive              bool      `xorm:"notnull default(true) index(idx_model_official_prices_lookup) 'is_active'" json:"is_active"`
	CreatedAt             time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt             time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ModelOfficialPrice) TableName() string { return "model_official_prices" }

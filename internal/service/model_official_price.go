package service

import (
	"fmt"
	"math/big"
	"strings"

	"fanapi/internal/model"
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

package service

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const (
	USDCNYExchangeRateSettingKey = "usd_cny_exchange_rate"
	DefaultUSDCNYExchangeRate    = 7.20
)

func ParseUSDCNYExchangeRate(value string) (float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, fmt.Errorf("USD/CNY exchange rate must be a positive number")
	}
	rate, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 0, fmt.Errorf("USD/CNY exchange rate must be a finite positive number")
	}
	return rate, nil
}

func USDCNYExchangeRateOrDefault(value string) float64 {
	rate, err := ParseUSDCNYExchangeRate(value)
	if err != nil {
		return DefaultUSDCNYExchangeRate
	}
	return rate
}

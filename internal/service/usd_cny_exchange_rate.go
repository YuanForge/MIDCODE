package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"

	"xorm.io/xorm"
)

const (
	USDCNYExchangeRateSettingKey                  = "usd_cny_exchange_rate"
	USDCNYExchangeRateSourceSettingKey            = "usd_cny_exchange_rate_source"
	USDCNYExchangeRateDateSettingKey              = "usd_cny_exchange_rate_date"
	USDCNYExchangeRateSyncedAtSettingKey          = "usd_cny_exchange_rate_synced_at"
	USDCNYExchangeRateLastAttemptSettingKey       = "usd_cny_exchange_rate_last_attempt_at"
	USDCNYExchangeRateLastErrorSettingKey         = "usd_cny_exchange_rate_last_error"
	frankfurterUSDCNYRateURL                      = "https://api.frankfurter.dev/v2/rate/USD/CNY"
	frankfurterUSDCNYRateMaxBytes           int64 = 64 << 10
	usdCNYExchangeRateSyncInterval                = 6 * time.Hour
	usdCNYExchangeRateErrorMaxLength              = 512
)

var (
	usdCNYExchangeRateHTTPClient = &http.Client{Timeout: 10 * time.Second}
	usdCNYExchangeRateRunning    atomic.Bool
)

type frankfurterUSDCNYRate struct {
	Value string
	Date  string
}

func parseFrankfurterUSDCNYRate(reader io.Reader, maxBytes int64) (frankfurterUSDCNYRate, error) {
	body, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
	if err != nil {
		return frankfurterUSDCNYRate{}, fmt.Errorf("read Frankfurter response: %w", err)
	}
	if int64(len(body)) > maxBytes {
		return frankfurterUSDCNYRate{}, fmt.Errorf("Frankfurter response exceeds %d bytes", maxBytes)
	}

	var response struct {
		Date  string          `json:"date"`
		Base  string          `json:"base"`
		Quote string          `json:"quote"`
		Rate  json.RawMessage `json:"rate"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&response); err != nil {
		return frankfurterUSDCNYRate{}, fmt.Errorf("decode Frankfurter response: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return frankfurterUSDCNYRate{}, fmt.Errorf("decode Frankfurter response: trailing data")
	}
	if response.Base != "USD" || response.Quote != "CNY" {
		return frankfurterUSDCNYRate{}, fmt.Errorf("unexpected Frankfurter pair %q/%q", response.Base, response.Quote)
	}
	parsedDate, err := time.Parse("2006-01-02", response.Date)
	if err != nil || parsedDate.Format("2006-01-02") != response.Date {
		return frankfurterUSDCNYRate{}, fmt.Errorf("invalid Frankfurter date %q", response.Date)
	}
	rate := strings.TrimSpace(string(response.Rate))
	if _, err := parsePositiveOfficialPriceDecimal(rate); err != nil {
		return frankfurterUSDCNYRate{}, fmt.Errorf("invalid Frankfurter rate %q: %w", rate, err)
	}
	return frankfurterUSDCNYRate{Value: rate, Date: response.Date}, nil
}

func fetchFrankfurterUSDCNYRate(ctx context.Context, client *http.Client, url string) (frankfurterUSDCNYRate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return frankfurterUSDCNYRate{}, fmt.Errorf("create Frankfurter request: %w", err)
	}
	response, err := client.Do(req)
	if err != nil {
		return frankfurterUSDCNYRate{}, fmt.Errorf("fetch Frankfurter rate: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return frankfurterUSDCNYRate{}, fmt.Errorf("fetch Frankfurter rate: HTTP %d", response.StatusCode)
	}
	return parseFrankfurterUSDCNYRate(response.Body, frankfurterUSDCNYRateMaxBytes)
}

// StartUSDCNYExchangeRateSyncer starts one immediate sync followed by six-hour refreshes.
func StartUSDCNYExchangeRateSyncer(ctx context.Context) {
	go runUSDCNYExchangeRateSyncLoop(ctx, usdCNYExchangeRateSyncInterval, func(ctx context.Context) {
		runUSDCNYExchangeRateSyncOnce(ctx, &usdCNYExchangeRateRunning, func(ctx context.Context) {
			if err := syncUSDCNYExchangeRate(ctx, time.Now().UTC()); err != nil {
				log.Printf("[usd-cny-exchange-rate] sync failed: %v", err)
			}
		})
	})
}

func runUSDCNYExchangeRateSyncLoop(ctx context.Context, interval time.Duration, syncFn func(context.Context)) {
	syncFn(ctx)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			syncFn(ctx)
		}
	}
}

func runUSDCNYExchangeRateSyncOnce(ctx context.Context, running *atomic.Bool, syncFn func(context.Context)) bool {
	if !running.CompareAndSwap(false, true) {
		return false
	}
	defer running.Store(false)
	syncFn(ctx)
	return true
}

func syncUSDCNYExchangeRate(ctx context.Context, attemptedAt time.Time) error {
	rate, err := fetchFrankfurterUSDCNYRate(ctx, usdCNYExchangeRateHTTPClient, frankfurterUSDCNYRateURL)
	if err != nil {
		if persistErr := persistUSDCNYExchangeRateFailure(ctx, attemptedAt, err); persistErr != nil {
			return fmt.Errorf("%v; persist failure state: %w", err, persistErr)
		}
		return err
	}
	return persistUSDCNYExchangeRateSuccess(ctx, rate, attemptedAt)
}

func persistUSDCNYExchangeRateSuccess(ctx context.Context, rate frankfurterUSDCNYRate, syncedAt time.Time) (err error) {
	session := db.Engine.NewSession().Context(ctx)
	defer session.Close()
	if err = session.Begin(); err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = session.Rollback()
		}
	}()

	if _, err = lockUSDCNYExchangeRateSetting(session, true); err != nil {
		return err
	}
	settings, err := loadUSDCNYExchangeRateSettings(session)
	if err != nil {
		return err
	}
	_, existingAutomatic := parseAutomaticUSDCNYExchangeRate(settings)
	unchanged := existingAutomatic && settings[USDCNYExchangeRateSettingKey] == rate.Value && settings[USDCNYExchangeRateDateSettingKey] == rate.Date
	if !unchanged {
		var prices []model.ModelOfficialPrice
		if err = session.Where("currency = ?", "USD").Find(&prices); err != nil {
			return err
		}
		for _, price := range prices {
			normalized, normalizeErr := NormalizeOfficialPriceConfig("USD", price.BillingType, price.SourcePriceConfig, rate.Value)
			if normalizeErr != nil {
				return fmt.Errorf("normalize official price %d: %w", price.ID, normalizeErr)
			}
			update := &model.ModelOfficialPrice{
				NormalizedPriceConfig: normalized,
				ExchangeRateUsed:      rate.Value,
				ExchangeRateDate:      rate.Date,
			}
			if _, err = session.ID(price.ID).Cols("normalized_price_config", "exchange_rate_used", "exchange_rate_date").Update(update); err != nil {
				return fmt.Errorf("update official price %d: %w", price.ID, err)
			}
		}
	}

	timestamp := syncedAt.UTC().Format(time.RFC3339Nano)
	updates := map[string]string{
		USDCNYExchangeRateSettingKey:            rate.Value,
		USDCNYExchangeRateSourceSettingKey:      "frankfurter",
		USDCNYExchangeRateDateSettingKey:        rate.Date,
		USDCNYExchangeRateSyncedAtSettingKey:    timestamp,
		USDCNYExchangeRateLastAttemptSettingKey: timestamp,
		USDCNYExchangeRateLastErrorSettingKey:   "",
	}
	for key, value := range updates {
		if err = upsertSystemSetting(session, key, value); err != nil {
			return err
		}
	}
	return session.Commit()
}

func persistUSDCNYExchangeRateFailure(ctx context.Context, attemptedAt time.Time, syncErr error) (err error) {
	session := db.Engine.NewSession().Context(ctx)
	defer session.Close()
	if err = session.Begin(); err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = session.Rollback()
		}
	}()
	updates := map[string]string{
		USDCNYExchangeRateLastAttemptSettingKey: attemptedAt.UTC().Format(time.RFC3339Nano),
		USDCNYExchangeRateLastErrorSettingKey:   boundedUSDCNYExchangeRateError(syncErr),
	}
	for key, value := range updates {
		if err = upsertSystemSetting(session, key, value); err != nil {
			return err
		}
	}
	return session.Commit()
}

func upsertSystemSetting(session *xorm.Session, key, value string) error {
	_, err := session.Exec(`
		INSERT INTO system_settings (key, value, created_at, updated_at)
		VALUES (?, ?, NOW(), NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
	`, key, value)
	return err
}

func loadUSDCNYExchangeRateSettings(session *xorm.Session) (map[string]string, error) {
	keys := []string{
		USDCNYExchangeRateSettingKey,
		USDCNYExchangeRateSourceSettingKey,
		USDCNYExchangeRateDateSettingKey,
		USDCNYExchangeRateSyncedAtSettingKey,
	}
	var rows []model.SystemSetting
	if err := session.In("key", keys).Find(&rows); err != nil {
		return nil, err
	}
	settings := make(map[string]string, len(rows))
	for _, row := range rows {
		settings[row.Key] = row.Value
	}
	return settings, nil
}

func lockUSDCNYExchangeRateSetting(session *xorm.Session, exclusive bool) (bool, error) {
	lock := "FOR SHARE"
	if exclusive {
		lock = "FOR UPDATE"
	}
	var row struct {
		Value string `xorm:"value"`
	}
	return session.SQL("SELECT value FROM system_settings WHERE key = ? "+lock, USDCNYExchangeRateSettingKey).Get(&row)
}

func parseAutomaticUSDCNYExchangeRate(settings map[string]string) (float64, bool) {
	if settings[USDCNYExchangeRateSourceSettingKey] != "frankfurter" {
		return 0, false
	}
	date, err := time.Parse("2006-01-02", settings[USDCNYExchangeRateDateSettingKey])
	if err != nil || date.Format("2006-01-02") != settings[USDCNYExchangeRateDateSettingKey] {
		return 0, false
	}
	if _, err := time.Parse(time.RFC3339Nano, settings[USDCNYExchangeRateSyncedAtSettingKey]); err != nil {
		return 0, false
	}
	rate, err := ParseUSDCNYExchangeRate(settings[USDCNYExchangeRateSettingKey])
	if err != nil {
		return 0, false
	}
	return rate, true
}

func boundedUSDCNYExchangeRateError(err error) string {
	message := strings.TrimSpace(err.Error())
	if len(message) > usdCNYExchangeRateErrorMaxLength {
		message = message[:usdCNYExchangeRateErrorMaxLength]
	}
	return message
}

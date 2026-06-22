package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"fanapi/internal/config"
	"fanapi/internal/db"
	"fanapi/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"xorm.io/xorm"
)

type CreateResellerInput struct {
	Username    string
	Email       string
	Password    string
	Name        string
	ContactName string
	Phone       string
	Notes       string
}

type CreateResellerSiteInput struct {
	APIKeyID     int64
	SiteName     string
	LogoURL      string
	Domain       string
	ProfitRatio  float64
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
}

type ResellerAPIKeyItem struct {
	ID         int64       `json:"id"`
	Name       string      `json:"name"`
	KeyType    string      `json:"key_type"`
	KeyPrefix  string      `json:"key_prefix"`
	RawKey     string      `json:"raw_key"`
	Viewable   bool        `json:"viewable"`
	IsActive   bool        `json:"is_active"`
	SiteCount  int64       `json:"site_count"`
	LastUsedAt interface{} `json:"last_used_at"`
	CreatedAt  interface{} `json:"created_at"`
}

type ResellerSiteBuildResult struct {
	Site model.ResellerSite
	Job  model.ResellerSiteBuildJob
}

func CreateReseller(ctx context.Context, input CreateResellerInput) (*model.Reseller, *model.User, error) {
	username := strings.TrimSpace(input.Username)
	password := strings.TrimSpace(input.Password)
	name := strings.TrimSpace(input.Name)
	if username == "" || password == "" || name == "" {
		return nil, nil, fmt.Errorf("username, password and name are required")
	}
	if len(password) < 8 {
		return nil, nil, fmt.Errorf("password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, err
	}

	var emailPtr *string
	email := strings.TrimSpace(input.Email)
	if email != "" {
		emailPtr = &email
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return nil, nil, err
	}

	user := &model.User{
		Username:     username,
		Email:        emailPtr,
		PasswordHash: string(hash),
		Role:         "reseller",
		IsActive:     true,
		InviteCode:   generateInviteCode(),
	}
	if _, err := sess.Insert(user); err != nil {
		sess.Rollback()
		return nil, nil, fmt.Errorf("create reseller user: %w", err)
	}

	reseller := &model.Reseller{
		UserID:      user.ID,
		Name:        name,
		ContactName: strings.TrimSpace(input.ContactName),
		Phone:       strings.TrimSpace(input.Phone),
		Notes:       strings.TrimSpace(input.Notes),
		IsActive:    true,
	}
	if _, err := sess.Insert(reseller); err != nil {
		sess.Rollback()
		return nil, nil, fmt.Errorf("create reseller: %w", err)
	}

	if err := sess.Commit(); err != nil {
		return nil, nil, err
	}
	return reseller, user, nil
}

func LoginReseller(ctx context.Context, usernameOrEmail, password string, cfg *config.ServerConfig) (string, *model.Reseller, *model.User, error) {
	_, user, err := Login(ctx, usernameOrEmail, password, cfg)
	if err != nil {
		return "", nil, nil, err
	}
	if user.Role != "reseller" {
		return "", nil, nil, fmt.Errorf("not a reseller account")
	}
	reseller, err := GetActiveResellerByUserID(ctx, user.ID)
	if err != nil {
		return "", nil, nil, err
	}

	exp := time.Now().Add(time.Duration(cfg.JWTExpireHours) * time.Hour)
	claims := jwt.MapClaims{
		"sub":         user.ID,
		"role":        "reseller",
		"reseller_id": reseller.ID,
		"exp":         exp.Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(cfg.JWTSecret))
	return signed, reseller, user, err
}

func GetActiveResellerByUserID(ctx context.Context, userID int64) (*model.Reseller, error) {
	var reseller model.Reseller
	found, err := db.Engine.Context(ctx).Where("user_id = ?", userID).Get(&reseller)
	if err != nil {
		return nil, err
	}
	if !found || !reseller.IsActive {
		return nil, fmt.Errorf("reseller account not found or disabled")
	}
	return &reseller, nil
}

func ListResellerAPIKeys(ctx context.Context, resellerID int64, secret string) ([]ResellerAPIKeyItem, error) {
	reseller := &model.Reseller{}
	found, err := db.Engine.Context(ctx).ID(resellerID).Get(reseller)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("reseller not found")
	}

	var keys []model.APIKey
	if err := db.Engine.Context(ctx).
		Where("user_id = ?", reseller.UserID).
		Cols("id", "name", "key_hash", "raw_key_enc", "key_type", "is_active", "last_used_at", "created_at").
		Desc("id").
		Find(&keys); err != nil {
		return nil, err
	}

	items := make([]ResellerAPIKeyItem, 0, len(keys))
	for _, key := range keys {
		prefix := key.KeyHash
		if len(prefix) > 12 {
			prefix = prefix[:12]
		}
		rawKey := ""
		viewable := false
		if key.RawKeyEnc != "" {
			if decrypted, err := DecryptAPIKey(key.RawKeyEnc, secret); err == nil {
				rawKey = decrypted
				viewable = true
			}
		}
		siteCount, _ := db.Engine.Context(ctx).
			Where("reseller_id = ? AND api_key_id = ? AND is_active = true", resellerID, key.ID).
			Count(&model.ResellerSiteKeyBinding{})
		keyType := key.KeyType
		if keyType == "" {
			keyType = "low_price"
		}
		items = append(items, ResellerAPIKeyItem{
			ID:         key.ID,
			Name:       key.Name,
			KeyType:    keyType,
			KeyPrefix:  prefix,
			RawKey:     rawKey,
			Viewable:   viewable,
			IsActive:   key.IsActive,
			SiteCount:  siteCount,
			LastUsedAt: key.LastUsedAt,
			CreatedAt:  key.CreatedAt,
		})
	}
	return items, nil
}

func GenerateResellerAPIKey(ctx context.Context, resellerID int64, name, keyType, secret string) (string, error) {
	reseller := &model.Reseller{}
	found, err := db.Engine.Context(ctx).ID(resellerID).Get(reseller)
	if err != nil {
		return "", err
	}
	if !found || !reseller.IsActive {
		return "", fmt.Errorf("reseller account not found or disabled")
	}
	if strings.TrimSpace(name) == "" {
		name = "代理站 Key"
	}
	return GenerateAPIKey(ctx, reseller.UserID, name, keyType, secret)
}

func CreateResellerSite(ctx context.Context, resellerID int64, input CreateResellerSiteInput, cfg *config.Config) (*ResellerSiteBuildResult, error) {
	reseller := &model.Reseller{}
	found, err := db.Engine.Context(ctx).ID(resellerID).Get(reseller)
	if err != nil {
		return nil, err
	}
	if !found || !reseller.IsActive {
		return nil, fmt.Errorf("reseller account not found or disabled")
	}

	siteName := strings.TrimSpace(input.SiteName)
	if siteName == "" {
		return nil, fmt.Errorf("site_name is required")
	}
	if input.ProfitRatio <= 0 {
		input.ProfitRatio = cfg.ResellerBuilder.DefaultProfitRatio
	}
	if input.ProfitRatio < 1 {
		return nil, fmt.Errorf("profit_ratio must be greater than or equal to 1")
	}
	if input.SMTPPort <= 0 {
		input.SMTPPort = 465
	}
	if strings.TrimSpace(input.SMTPHost) == "" || strings.TrimSpace(input.SMTPUser) == "" ||
		strings.TrimSpace(input.SMTPPassword) == "" || strings.TrimSpace(input.SMTPFrom) == "" {
		return nil, fmt.Errorf("smtp fields are required")
	}

	apiKey, err := pickResellerAPIKey(ctx, reseller.UserID, input.APIKeyID)
	if err != nil {
		return nil, err
	}

	siteCode, err := generateUniqueSiteCode(ctx, siteName)
	if err != nil {
		return nil, err
	}

	dbName := siteCode
	natsNamespace := "site_" + siteCode
	codePath := path.Join(strings.TrimRight(cfg.ResellerBuilder.BasePath, "/"), siteCode)
	publicURL := ""
	domain := strings.TrimSpace(input.Domain)
	if domain != "" {
		publicURL = "https://" + domain
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return nil, err
	}
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock(hashtext('reseller_site_resource_alloc'))"); err != nil {
		sess.Rollback()
		return nil, fmt.Errorf("lock reseller site resources: %w", err)
	}
	redisDB, err := nextIntResourceInSession(sess, "redis_db", cfg.ResellerBuilder.DefaultRedisStart)
	if err != nil {
		sess.Rollback()
		return nil, err
	}
	appPort, err := nextIntResourceInSession(sess, "app_port", cfg.ResellerBuilder.DefaultAppPort)
	if err != nil {
		sess.Rollback()
		return nil, err
	}

	site := &model.ResellerSite{
		ResellerID:    reseller.ID,
		UserID:        reseller.UserID,
		APIKeyID:      apiKey.ID,
		SiteName:      siteName,
		LogoURL:       strings.TrimSpace(input.LogoURL),
		Domain:        domain,
		SiteCode:      siteCode,
		DBName:        dbName,
		RedisDB:       redisDB,
		AppPort:       appPort,
		NATSNamespace: natsNamespace,
		CodePath:      codePath,
		PublicURL:     publicURL,
		Status:        "pending",
		ProfitRatio:   input.ProfitRatio,
		SMTPHost:      strings.TrimSpace(input.SMTPHost),
		SMTPPort:      input.SMTPPort,
		SMTPUser:      strings.TrimSpace(input.SMTPUser),
		SMTPPassword:  strings.TrimSpace(input.SMTPPassword),
		SMTPFrom:      strings.TrimSpace(input.SMTPFrom),
	}
	if _, err := sess.Insert(site); err != nil {
		sess.Rollback()
		return nil, fmt.Errorf("create reseller site: %w", err)
	}

	binding := &model.ResellerSiteKeyBinding{
		ResellerID: reseller.ID,
		SiteID:     site.ID,
		APIKeyID:   apiKey.ID,
		IsActive:   true,
	}
	if _, err := sess.Insert(binding); err != nil {
		sess.Rollback()
		return nil, fmt.Errorf("bind reseller key: %w", err)
	}

	job := &model.ResellerSiteBuildJob{
		SiteID:     site.ID,
		ResellerID: reseller.ID,
		Status:     "pending",
		Step:       "manual_ops_required",
		Resources: model.JSON{
			"site_code":      site.SiteCode,
			"db_name":        site.DBName,
			"redis_db":       site.RedisDB,
			"app_port":       site.AppPort,
			"nats_namespace": site.NATSNamespace,
			"code_path":      site.CodePath,
			"auto_build":     cfg.ResellerBuilder.AutoBuild,
		},
	}
	if cfg.ResellerBuilder.AutoBuild {
		job.Step = "pending"
	}
	if _, err := sess.Insert(job); err != nil {
		sess.Rollback()
		return nil, fmt.Errorf("create build job: %w", err)
	}
	if err := sess.Commit(); err != nil {
		return nil, err
	}

	if cfg.ResellerBuilder.AutoBuild {
		go func(jobID int64) {
			if err := BuildResellerSite(context.Background(), jobID, cfg); err != nil {
				log.Printf("[reseller-build] job=%d failed: %v", jobID, err)
			}
		}(job.ID)
	}

	return &ResellerSiteBuildResult{Site: *site, Job: *job}, nil
}

func StartPendingResellerSiteBuildJobs(ctx context.Context, cfg *config.Config) {
	if !cfg.ResellerBuilder.AutoBuild {
		log.Printf("[reseller-build] auto build disabled; pending reseller site jobs will stay queued")
		return
	}

	var jobs []model.ResellerSiteBuildJob
	if err := db.Engine.Context(ctx).
		Where("status = ?", "pending").
		Asc("id").
		Find(&jobs); err != nil {
		log.Printf("[reseller-build] load pending jobs failed: %v", err)
		return
	}
	if len(jobs) == 0 {
		return
	}
	log.Printf("[reseller-build] starting %d pending reseller site build job(s)", len(jobs))
	for _, job := range jobs {
		jobID := job.ID
		go func() {
			select {
			case <-ctx.Done():
				return
			default:
			}
			if err := BuildResellerSite(ctx, jobID, cfg); err != nil {
				log.Printf("[reseller-build] job=%d failed: %v", jobID, err)
			}
		}()
	}
}

func pickResellerAPIKey(ctx context.Context, userID, requestedID int64) (*model.APIKey, error) {
	apiKey := &model.APIKey{}
	var found bool
	var err error
	if requestedID > 0 {
		found, err = db.Engine.Context(ctx).
			Where("id = ? AND user_id = ? AND is_active = true", requestedID, userID).
			Get(apiKey)
	} else {
		found, err = db.Engine.Context(ctx).
			Where("user_id = ? AND is_active = true", userID).
			Desc("id").
			Get(apiKey)
	}
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("please create an active API key before creating a site")
	}
	return apiKey, nil
}

func generateUniqueSiteCode(ctx context.Context, name string) (string, error) {
	base := sanitizeSiteCode(name)
	if base == "" {
		base = "site"
	}
	if len(base) > 32 {
		base = strings.Trim(base[:32], "_")
	}
	for i := 0; i < 8; i++ {
		suffix, err := randomAlphaNum(8)
		if err != nil {
			return "", err
		}
		code := base + "_" + suffix
		exists, err := db.Engine.Context(ctx).Where("site_code = ?", code).Exist(&model.ResellerSite{})
		if err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", fmt.Errorf("failed to generate unique site code")
}

func sanitizeSiteCode(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	var b strings.Builder
	lastUnderscore := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnderscore = false
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		default:
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}

func randomAlphaNum(n int) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	buf := make([]byte, n)
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	for i := range raw {
		buf[i] = alphabet[int(raw[i])%len(alphabet)]
	}
	return string(buf), nil
}

func nextIntResource(ctx context.Context, column string, start int) (int, error) {
	return nextIntResourceQuery(func(sql string, args ...interface{}) ([]map[string]string, error) {
		return db.Engine.Context(ctx).SQL(sql, args...).QueryString()
	}, column, start)
}

func nextIntResourceInSession(sess *xorm.Session, column string, start int) (int, error) {
	return nextIntResourceQuery(func(sql string, args ...interface{}) ([]map[string]string, error) {
		return sess.SQL(sql, args...).QueryString()
	}, column, start)
}

func nextIntResourceQuery(query func(string, ...interface{}) ([]map[string]string, error), column string, start int) (int, error) {
	if start <= 0 {
		start = 1
	}
	rows, err := query(
		fmt.Sprintf("SELECT COALESCE(MAX(%s), $1 - 1) + 1 AS next_value FROM reseller_sites WHERE %s >= $1", column, column),
		start,
	)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 || rows[0]["next_value"] == "" {
		return start, nil
	}
	value, err := strconv.Atoi(rows[0]["next_value"])
	if err != nil || value < start {
		return start, nil
	}
	return value, nil
}

func BuildResellerSite(ctx context.Context, jobID int64, cfg *config.Config) error {
	if !cfg.ResellerBuilder.AutoBuild {
		return fmt.Errorf("reseller_builder.auto_build is disabled")
	}
	var job model.ResellerSiteBuildJob
	found, err := db.Engine.Context(ctx).ID(jobID).Get(&job)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("build job not found")
	}
	var site model.ResellerSite
	found, err = db.Engine.Context(ctx).ID(job.SiteID).Get(&site)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("site not found")
	}

	if err := claimResellerBuildJob(ctx, &job, &site); err != nil {
		return err
	}

	var apiKey model.APIKey
	found, err = db.Engine.Context(ctx).
		Where("id = ? AND user_id = ? AND is_active = true", site.APIKeyID, site.UserID).
		Get(&apiKey)
	if err != nil {
		return err
	}
	if !found {
		return markBuildFailed(ctx, &job, &site, "validate_key", fmt.Errorf("bound API key not found or disabled"))
	}
	rawKey, err := DecryptAPIKey(apiKey.RawKeyEnc, cfg.Server.JWTSecret)
	if err != nil {
		return markBuildFailed(ctx, &job, &site, "validate_key", err)
	}

	createdDB := false
	copiedCode := false
	if err := updateBuildStep(ctx, job.ID, "create_database"); err != nil {
		return err
	}
	if _, err := db.Engine.Context(ctx).Exec("CREATE DATABASE " + quoteIdentifier(site.DBName)); err != nil {
		return failAndCleanup(ctx, &job, &site, "create_database", err, createdDB, copiedCode, cfg)
	}
	createdDB = true

	if err := updateBuildStep(ctx, job.ID, "copy_code"); err != nil {
		return err
	}
	if err := copyDir(cfg.ResellerBuilder.SourcePath, site.CodePath); err != nil {
		return failAndCleanup(ctx, &job, &site, "copy_code", err, createdDB, copiedCode, cfg)
	}
	copiedCode = true

	if err := updateBuildStep(ctx, job.ID, "write_config"); err != nil {
		return err
	}
	if err := writeResellerSiteConfig(site, rawKey, cfg); err != nil {
		return failAndCleanup(ctx, &job, &site, "write_config", err, createdDB, copiedCode, cfg)
	}
	if err := writeResellerSiteEnv(site); err != nil {
		return failAndCleanup(ctx, &job, &site, "write_env", err, createdDB, copiedCode, cfg)
	}

	if err := updateBuildStep(ctx, job.ID, "start_service"); err != nil {
		return err
	}
	if err := runDockerCompose(ctx, site.CodePath, site.SiteCode); err != nil {
		return failAndCleanup(ctx, &job, &site, "start_service", err, createdDB, copiedCode, cfg)
	}

	finished := time.Now()
	job.Status = "success"
	job.Step = "success"
	job.FinishedAt = &finished
	job.Error = ""
	site.Status = "running"
	site.LastError = ""
	if _, err := db.Engine.Context(ctx).ID(job.ID).Cols("status", "step", "finished_at", "error").Update(&job); err != nil {
		return err
	}
	_, err = db.Engine.Context(ctx).ID(site.ID).Cols("status", "last_error").Update(&site)
	return err
}

func claimResellerBuildJob(ctx context.Context, job *model.ResellerSiteBuildJob, site *model.ResellerSite) error {
	if job.Status == "success" {
		return fmt.Errorf("build job already succeeded")
	}
	now := time.Now()
	update := &model.ResellerSiteBuildJob{
		Status:     "building",
		Step:       "prepare",
		Error:      "",
		StartedAt:  &now,
		FinishedAt: nil,
	}
	affected, err := db.Engine.Context(ctx).
		Where("id = ? AND status IN (?, ?)", job.ID, "pending", "failed").
		Cols("status", "step", "error", "started_at", "finished_at").
		Update(update)
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("build job is %s and cannot be started", job.Status)
	}
	job.Status = update.Status
	job.Step = update.Step
	job.Error = update.Error
	job.StartedAt = update.StartedAt
	job.FinishedAt = nil

	site.Status = "building"
	site.LastError = ""
	db.Engine.Context(ctx).ID(site.ID).Cols("status", "last_error").Update(site) //nolint:errcheck
	return nil
}

func updateBuildStep(ctx context.Context, jobID int64, step string) error {
	_, err := db.Engine.Context(ctx).ID(jobID).Cols("step").Update(&model.ResellerSiteBuildJob{Step: step})
	return err
}

func markBuildFailed(ctx context.Context, job *model.ResellerSiteBuildJob, site *model.ResellerSite, step string, buildErr error) error {
	finished := time.Now()
	msg := buildErr.Error()
	job.Status = "failed"
	job.Step = step
	job.Error = msg
	job.FinishedAt = &finished
	site.Status = "failed"
	site.LastError = msg
	db.Engine.Context(ctx).ID(job.ID).Cols("status", "step", "error", "finished_at").Update(job) //nolint:errcheck
	db.Engine.Context(ctx).ID(site.ID).Cols("status", "last_error").Update(site)                 //nolint:errcheck
	return buildErr
}

func failAndCleanup(ctx context.Context, job *model.ResellerSiteBuildJob, site *model.ResellerSite, step string, buildErr error, createdDB, copiedCode bool, cfg *config.Config) error {
	cleanupErrors := []string{}
	if createdDB {
		if _, err := db.Engine.Context(ctx).Exec("DROP DATABASE IF EXISTS " + quoteIdentifier(site.DBName)); err != nil {
			cleanupErrors = append(cleanupErrors, "drop database: "+err.Error())
		}
	}
	if copiedCode {
		if step == "start_service" {
			if err := cleanupDockerCompose(ctx, site.CodePath, site.SiteCode); err != nil {
				cleanupErrors = append(cleanupErrors, "docker compose down: "+err.Error())
			}
		}
		if err := removeCodePathSafely(cfg.ResellerBuilder.BasePath, site.CodePath); err != nil {
			cleanupErrors = append(cleanupErrors, "remove code path: "+err.Error())
		}
	}
	if len(cleanupErrors) > 0 {
		buildErr = fmt.Errorf("%w; cleanup failed: %s", buildErr, strings.Join(cleanupErrors, "; "))
	}
	return markBuildFailed(ctx, job, site, step, buildErr)
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func copyDir(src, dst string) error {
	src = filepath.Clean(src)
	dst = filepath.Clean(dst)
	return filepath.WalkDir(src, func(pathValue string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, pathValue)
		if err != nil {
			return err
		}
		if shouldSkipResellerCopy(rel, d.IsDir()) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		return copyFile(pathValue, target, info.Mode())
	})
}

func shouldSkipResellerCopy(rel string, isDir bool) bool {
	normalized := filepath.ToSlash(filepath.Clean(rel))
	if normalized == "." {
		return false
	}
	base := path.Base(normalized)
	if isDir {
		switch base {
		case ".git", "node_modules", "dist":
			return true
		}
		switch normalized {
		case "uploads", "web/app/dist":
			return true
		}
		return false
	}
	switch base {
	case "config.yaml", "config.local.yaml", ".env":
		return true
	}
	return strings.HasPrefix(base, ".env.")
}

func copyFile(src, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func writeResellerSiteConfig(site model.ResellerSite, rawKey string, cfg *config.Config) error {
	platformBaseURL := strings.TrimSpace(cfg.ResellerBuilder.PlatformBaseURL)
	if platformBaseURL == "" {
		platformBaseURL = strings.TrimSpace(cfg.PlatformAPI.BaseURL)
	}
	content := fmt.Sprintf(`app:
  mode: reseller_site

server:
  port: %d
  jwt_secret: %q
  jwt_expire_hours: %d

db:
  host: %q
  port: %d
  user: %q
  password: %q
  dbname: %q
  sslmode: %q

redis:
  addr: %q
  password: %q
  db: %d

nats:
  url: %q
  namespace: %q
  task_stream: %q
  task_subject: %q
  result_stream: %q
  result_subject: %q

smtp:
  host: %q
  port: %d
  user: %q
  password: %q
  from: %q

platform_api:
  base_url: %q
  key: %q
  price_sync_enabled: true

reseller_site:
  site_code: %q
  site_name: %q
  logo_url: %q
  profit_ratio: %.6f
`,
		8080, cfg.Server.JWTSecret, cfg.Server.JWTExpireHours,
		cfg.DB.Host, cfg.DB.Port, cfg.DB.User, cfg.DB.Password, site.DBName, cfg.DB.SSLMode,
		cfg.Redis.Addr, cfg.Redis.Password, site.RedisDB,
		cfg.NATS.URL, site.NATSNamespace, "TASKS_"+site.NATSNamespace, site.NATSNamespace+".task.>", "RESULTS_"+site.NATSNamespace, site.NATSNamespace+".result.>",
		site.SMTPHost, site.SMTPPort, site.SMTPUser, site.SMTPPassword, site.SMTPFrom,
		platformBaseURL, rawKey,
		site.SiteCode, site.SiteName, site.LogoURL, site.ProfitRatio,
	)
	return os.WriteFile(filepath.Join(site.CodePath, "config.yaml"), []byte(content), 0600)
}

func writeResellerSiteEnv(site model.ResellerSite) error {
	content := fmt.Sprintf("FANAPI_HTTP_BIND=127.0.0.1:%d\n", site.AppPort)
	return os.WriteFile(filepath.Join(site.CodePath, ".env"), []byte(content), 0600)
}

func runDockerCompose(ctx context.Context, dir, projectName string) error {
	cmdCtx, cancel := context.WithTimeout(ctx, 20*time.Minute)
	defer cancel()
	return runComposeCommand(cmdCtx, dir, projectName, "up", "-d", "--build")
}

func cleanupDockerCompose(ctx context.Context, dir, projectName string) error {
	cmdCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	return runComposeCommand(cmdCtx, dir, projectName, "down", "--remove-orphans")
}

func runComposeCommand(ctx context.Context, dir, projectName string, args ...string) error {
	candidates := []struct {
		name string
		args []string
	}{
		{name: "docker", args: append([]string{"compose", "-p", projectName}, args...)},
		{name: "docker-compose", args: append([]string{"-p", projectName}, args...)},
	}
	failures := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		cmd := exec.CommandContext(ctx, candidate.name, candidate.args...)
		cmd.Dir = dir
		out, err := cmd.CombinedOutput()
		if err == nil {
			return nil
		}
		failures = append(failures, fmt.Sprintf("%s %s: %v: %s", candidate.name, strings.Join(candidate.args, " "), err, strings.TrimSpace(string(out))))
	}
	return fmt.Errorf("compose command failed: %s", strings.Join(failures, "; "))
}

func removeCodePathSafely(basePath, codePath string) error {
	baseAbs, err := filepath.Abs(filepath.Clean(basePath))
	if err != nil {
		return err
	}
	targetAbs, err := filepath.Abs(filepath.Clean(codePath))
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(baseAbs, targetAbs)
	if err != nil {
		return err
	}
	if rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return fmt.Errorf("refuse to remove path outside base path")
	}
	return os.RemoveAll(targetAbs)
}

func APIKeyIDFromRaw(rawKey string) (int64, error) {
	h := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(h[:])
	var apiKey model.APIKey
	found, err := db.Engine.Where("key_hash = ?", keyHash).Cols("id").Get(&apiKey)
	if err != nil {
		return 0, err
	}
	if !found {
		return 0, fmt.Errorf("api key not found")
	}
	return apiKey.ID, nil
}

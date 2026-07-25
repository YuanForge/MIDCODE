package model

import "time"

// Reseller is a platform-managed reseller account. The backing User is used
// for platform API keys so existing API authentication and billing stay intact.
type Reseller struct {
	ID          int64     `xorm:"pk autoincr 'id'" json:"id"`
	UserID      int64     `xorm:"notnull unique 'user_id'" json:"user_id"`
	Name        string    `xorm:"notnull default('') 'name'" json:"name"`
	ContactName string    `xorm:"notnull default('') 'contact_name'" json:"contact_name"`
	Phone       string    `xorm:"notnull default('') 'phone'" json:"phone"`
	Notes       string    `xorm:"text 'notes'" json:"notes,omitempty"`
	IsActive    bool      `xorm:"notnull default(true) 'is_active'" json:"is_active"`
	CreatedAt   time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt   time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*Reseller) TableName() string { return "resellers" }

type ResellerSite struct {
	ID            int64     `xorm:"pk autoincr 'id'" json:"id"`
	ResellerID    int64     `xorm:"notnull index 'reseller_id'" json:"reseller_id"`
	UserID        int64     `xorm:"notnull index 'user_id'" json:"user_id"`
	APIKeyID      int64     `xorm:"notnull index 'api_key_id'" json:"api_key_id"`
	SiteName      string    `xorm:"notnull 'site_name'" json:"site_name"`
	LogoURL       string    `xorm:"notnull default('') 'logo_url'" json:"logo_url"`
	Domain        string    `xorm:"notnull default('') 'domain'" json:"domain"`
	SiteCode      string    `xorm:"notnull unique 'site_code'" json:"site_code"`
	DBName        string    `xorm:"notnull unique 'db_name'" json:"db_name"`
	RedisDB       int       `xorm:"notnull unique 'redis_db'" json:"redis_db"`
	AppPort       int       `xorm:"notnull unique 'app_port'" json:"app_port"`
	NATSNamespace string    `xorm:"notnull unique 'nats_namespace'" json:"nats_namespace"`
	CodePath      string    `xorm:"notnull 'code_path'" json:"code_path"`
	PublicURL     string    `xorm:"notnull default('') 'public_url'" json:"public_url"`
	Status        string    `xorm:"notnull default('pending') index 'status'" json:"status"`
	ProfitRatio   float64   `xorm:"notnull default(1.7) 'profit_ratio'" json:"profit_ratio"`
	SMTPHost      string    `xorm:"notnull default('') 'smtp_host'" json:"smtp_host"`
	SMTPPort      int       `xorm:"notnull default(465) 'smtp_port'" json:"smtp_port"`
	SMTPUser      string    `xorm:"notnull default('') 'smtp_user'" json:"smtp_user"`
	SMTPPassword  string    `xorm:"text 'smtp_password'" json:"-"`
	SMTPFrom      string    `xorm:"notnull default('') 'smtp_from'" json:"smtp_from"`
	LastError     string    `xorm:"text 'last_error'" json:"last_error,omitempty"`
	CreatedAt     time.Time `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt     time.Time `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ResellerSite) TableName() string { return "reseller_sites" }

type ResellerSiteBuildJob struct {
	ID         int64      `xorm:"pk autoincr 'id'" json:"id"`
	SiteID     int64      `xorm:"notnull index 'site_id'" json:"site_id"`
	ResellerID int64      `xorm:"notnull index 'reseller_id'" json:"reseller_id"`
	Status     string     `xorm:"notnull default('pending') index 'status'" json:"status"`
	Step       string     `xorm:"notnull default('pending') 'step'" json:"step"`
	Error      string     `xorm:"text 'error'" json:"error,omitempty"`
	Resources  JSON       `xorm:"jsonb 'resources'" json:"resources"`
	StartedAt  *time.Time `xorm:"'started_at' null" json:"started_at,omitempty"`
	FinishedAt *time.Time `xorm:"'finished_at' null" json:"finished_at,omitempty"`
	CreatedAt  time.Time  `xorm:"created 'created_at'" json:"created_at"`
	UpdatedAt  time.Time  `xorm:"updated 'updated_at'" json:"updated_at"`
}

func (*ResellerSiteBuildJob) TableName() string { return "reseller_site_build_jobs" }

type ResellerSiteKeyBinding struct {
	ID         int64     `xorm:"pk autoincr 'id'" json:"id"`
	ResellerID int64     `xorm:"notnull index 'reseller_id'" json:"reseller_id"`
	SiteID     int64     `xorm:"notnull index 'site_id'" json:"site_id"`
	APIKeyID   int64     `xorm:"notnull index 'api_key_id'" json:"api_key_id"`
	IsActive   bool      `xorm:"notnull default(true) 'is_active'" json:"is_active"`
	CreatedAt  time.Time `xorm:"created 'created_at'" json:"created_at"`
}

func (*ResellerSiteKeyBinding) TableName() string { return "reseller_site_key_bindings" }

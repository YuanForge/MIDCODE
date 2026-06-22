package config

import "github.com/spf13/viper"

type Config struct {
	App             AppConfig             `mapstructure:"app"`
	Server          ServerConfig          `mapstructure:"server"`
	DB              DBConfig              `mapstructure:"db"`
	Redis           RedisConfig           `mapstructure:"redis"`
	NATS            NATSConfig            `mapstructure:"nats"`
	SMTP            SMTPConfig            `mapstructure:"smtp"`
	Worker          WorkerConfig          `mapstructure:"worker"`
	PlatformAPI     PlatformAPIConfig     `mapstructure:"platform_api"`
	ResellerBuilder ResellerBuilderConfig `mapstructure:"reseller_builder"`
}

type AppConfig struct {
	Mode string `mapstructure:"mode"`
}

type ServerConfig struct {
	Port           int    `mapstructure:"port"`
	JWTSecret      string `mapstructure:"jwt_secret"`
	JWTExpireHours int    `mapstructure:"jwt_expire_hours"`
}

type DBConfig struct {
	Host           string `mapstructure:"host"`
	Port           int    `mapstructure:"port"`
	User           string `mapstructure:"user"`
	Password       string `mapstructure:"password"`
	DBName         string `mapstructure:"dbname"`
	SSLMode        string `mapstructure:"sslmode"`
	MaxOpenConns   int    `mapstructure:"max_open_conns"`    // 0 = unlimited
	MaxIdleConns   int    `mapstructure:"max_idle_conns"`    // 0 = Go default (2)
	ConnMaxIdleSec int    `mapstructure:"conn_max_idle_sec"` // 0 = no limit
}

type RedisConfig struct {
	Addr     string `mapstructure:"addr"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
}

type NATSConfig struct {
	URL           string `mapstructure:"url"`
	Namespace     string `mapstructure:"namespace"`      // NATS 逻辑命名空间；主站默认 master，代理站使用独立值
	TaskStream    string `mapstructure:"task_stream"`    // 任务 JetStream 名；为空时按 namespace 自动生成
	TaskSubject   string `mapstructure:"task_subject"`   // 任务主题通配符；为空时按 namespace 自动生成
	ResultStream  string `mapstructure:"result_stream"`  // 结果 JetStream 名；为空时按 namespace 自动生成
	ResultSubject string `mapstructure:"result_subject"` // 结果主题通配符；为空时按 namespace 自动生成
	MemoryStorage bool   `mapstructure:"memory_storage"` // true = 内存存储，吞吐更高但重启丢消息
	Replicas      int    `mapstructure:"replicas"`       // JetStream 副本数，单节点填 1（默认）
}

// WorkerConfig 控制此 Worker 进程订阅的 NATS 主题列表。
// 默认订阅当前 nats namespace 下的全类型任务主题。
// 如需运行专用 Worker（如 GPU 节点只处理视频），配置示例：
//
//	worker:
//	  subjects:
//	    - "task.video.*" # 自动补当前 namespace，例如 master.task.video.*
//	  max_concurrent: 10  # 最大同时执行的任务数，0 表示不限制
type WorkerConfig struct {
	Subjects      []string `mapstructure:"subjects"`
	MaxConcurrent int      `mapstructure:"max_concurrent"`
}

type SMTPConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	From     string `mapstructure:"from"`
}

type PlatformAPIConfig struct {
	BaseURL          string `mapstructure:"base_url"`
	Key              string `mapstructure:"key"`
	PriceSyncEnabled bool   `mapstructure:"price_sync_enabled"`
}

type ResellerBuilderConfig struct {
	AutoBuild          bool    `mapstructure:"auto_build"`
	SourcePath         string  `mapstructure:"source_path"`
	BasePath           string  `mapstructure:"base_path"`
	DefaultRedisStart  int     `mapstructure:"default_redis_start"`
	DefaultAppPort     int     `mapstructure:"default_app_port"`
	DefaultProfitRatio float64 `mapstructure:"default_profit_ratio"`
	PlatformBaseURL    string  `mapstructure:"platform_base_url"`
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/app")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}
	cfg.applyDefaults()
	return &cfg, nil
}

func (c *Config) applyDefaults() {
	if c.App.Mode == "" {
		c.App.Mode = "master"
	}
	if c.ResellerBuilder.SourcePath == "" {
		c.ResellerBuilder.SourcePath = "/data/code/FanAPI"
	}
	if c.ResellerBuilder.BasePath == "" {
		c.ResellerBuilder.BasePath = "/data/code"
	}
	if c.ResellerBuilder.DefaultRedisStart <= 0 {
		c.ResellerBuilder.DefaultRedisStart = 1
	}
	if c.ResellerBuilder.DefaultAppPort <= 0 {
		c.ResellerBuilder.DefaultAppPort = 18080
	}
	if c.ResellerBuilder.DefaultProfitRatio <= 0 {
		c.ResellerBuilder.DefaultProfitRatio = 1.7
	}
}

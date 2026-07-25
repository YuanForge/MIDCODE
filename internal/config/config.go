package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server ServerConfig `mapstructure:"server"`
	DB     DBConfig     `mapstructure:"db"`
	Redis  RedisConfig  `mapstructure:"redis"`
	NATS   NATSConfig   `mapstructure:"nats"`
	SMTP   SMTPConfig   `mapstructure:"smtp"`
	Worker WorkerConfig `mapstructure:"worker"`
}

type ServerConfig struct {
	Port           int      `mapstructure:"port"`
	JWTSecret      string   `mapstructure:"jwt_secret"`
	APIKeySecret   string   `mapstructure:"api_key_secret"`
	JWTExpireHours int      `mapstructure:"jwt_expire_hours"`
	TrustedProxies []string `mapstructure:"trusted_proxies"`
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
	if err := cfg.validateSecrets(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) validateSecrets() error {
	jwtSecret := strings.TrimSpace(c.Server.JWTSecret)
	apiKeySecret := strings.TrimSpace(c.Server.APIKeySecret)
	if !strongSecret(jwtSecret) || isPlaceholderSecret(jwtSecret) {
		return fmt.Errorf("server.jwt_secret must be a non-placeholder secret of at least 32 characters")
	}
	if !strongSecret(apiKeySecret) || isPlaceholderSecret(apiKeySecret) {
		return fmt.Errorf("server.api_key_secret must be a non-placeholder secret of at least 32 characters")
	}
	if apiKeySecret == jwtSecret {
		return fmt.Errorf("server.api_key_secret must be different from server.jwt_secret")
	}
	return nil
}

func strongSecret(secret string) bool {
	return len(strings.TrimSpace(secret)) >= 32
}

func isPlaceholderSecret(secret string) bool {
	normalized := strings.ToLower(strings.TrimSpace(secret))
	switch normalized {
	case "", "change-me", "change-me-in-production", "replace-me", "changeme":
		return true
	default:
		return strings.Contains(normalized, "change-me") ||
			strings.Contains(normalized, "replace-me") ||
			strings.Contains(normalized, "replace-with")
	}
}

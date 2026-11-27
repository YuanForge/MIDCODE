package handler

import (
	_ "embed"
	"strings"
)

//go:embed usage_rollup_read.sql
var usageReadTemplate string

var usageReportSQL = strings.Replace(usageReadTemplate, "RAW_QUERY",
	strings.Replace(usageStatsQuery, "FROM llm_logs ll LEFT JOIN",
		"FROM gaps g CROSS JOIN LATERAL (SELECT * FROM llm_logs WHERE user_id=$1 AND created_at>=g.lo AND created_at<g.hi OFFSET 0) ll LEFT JOIN", 1), 1)

package handler

import (
	"encoding/json"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"math"
)

const creditsPerYuan = 1_000_000 // 1 元 = 1,000,000 credits

// planCredits 根据支付金额查找匹配的充值套餐，返回含赠送积分的总内部 credits。
// 若无匹配套餐，则按标准汇率 amount*creditsPerYuan 计算（自定义金额，无赠送）。
func planCredits(amount float64) int64 {
	return planCreditsFromSetting(getSettingValue("recharge_plans"), amount)
}

func planCreditsFromSetting(raw string, amount float64) int64 {
	if raw != "" {
		var plans []map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &plans); err == nil {
			for _, p := range plans {
				planAmt, _ := p["amount"].(float64)
				if math.Abs(planAmt-amount) < 0.005 {
					// credits + bonus 均为展示积分（1显示积分 = creditsPerYuan 内部 credits）
					credits, _ := p["credits"].(float64)
					bonus, _ := p["bonus"].(float64)
					return int64((credits + bonus) * creditsPerYuan)
				}
			}
		}
	}
	// 自定义金额：按标准汇率，无赠送
	return int64(amount * creditsPerYuan)
}

// getSettingValue retrieves a single system setting value by key.
func getSettingValue(key string) string {
	s := &model.SystemSetting{}
	found, _ := db.Engine.Where("key = ?", key).Get(s)
	if !found {
		return ""
	}
	return s.Value
}

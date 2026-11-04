"""Apply the reviewed change to the preserved v1.0.69 production source."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
def edit(name, old, new, count):
    p = root / name
    s = p.read_text(encoding='utf-8')
    assert s.count(old) == count, (name, old, s.count(old))
    p.write_text(s.replace(old, new), encoding='utf-8')

edit('internal/billing/context_pricing.go', '"math"', '"math"\n "strings"\n "fanapi/internal/model"', 1)
edit('internal/billing/context_pricing.go', 'inputTokens <= GPTShortContextLimit', 'inputTokens <= ContextInputLimit(cfg)', 1)
p = root / 'internal/billing/context_pricing.go'
p.write_text(p.read_text(encoding='utf-8') + '''
// ChannelContextConfig applies MIDCODE's explicitly selected Sol 6.1 policy.
// This is a platform rule, not a claim about official API pricing.
func ChannelContextConfig(ch *model.Channel) map[string]interface{} {
 cfg := map[string]interface{}(ch.BillingConfig)
 if strings.EqualFold(strings.TrimSpace(ch.Model), "gpt-6.1-sol") {
  cfg = cloneConfigMap(cfg)
  cfg["context_input_limit"] = int64(500000)
 }
 return cfg
}

func ContextInputLimit(cfg map[string]interface{}) int64 {
 if n := getInt64Val(cfg, "context_input_limit"); n > 0 { return n }
 return GPTShortContextLimit
}
''', encoding='utf-8')
edit('internal/billing/pricer.go', 'map[string]interface{}(ch.BillingConfig)', 'ChannelContextConfig(ch)', 4)
edit('internal/handler/llm_billing.go', 'input > billing.GPTShortContextLimit', 'input > billing.ContextInputLimit(billing.ChannelContextConfig(ch))', 1)
edit('internal/handler/llm_billing.go', 'map[string]interface{}(ch.BillingConfig)', 'billing.ChannelContextConfig(ch)', 1)
edit('internal/handler/llm_log.go', 'map[string]interface{}(ch.BillingConfig)', 'billingcalc.ChannelContextConfig(ch)', 2)
edit('web/app/src/pages/user/UserModelsPage.tsx', 'GPT-6.1 Sol 默认上下文窗口为 500K token。', '单次输入 ≤500,000 token 按所示短档价格计费；超过后，整次请求按上述倍率计费。', 1)

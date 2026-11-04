from pathlib import Path
import sys,shutil
root=Path(sys.argv[1]);repo=Path(__file__).resolve().parents[2]
for rel in ['internal/handler/llm.go']:
 p=root/rel;s=p.read_text(encoding='utf-8-sig')
 if 'model_performance_start' not in s:
  s=s.replace('\"strings\"','\"strings\"\n\t\"time\"') if '\"time\"' not in s else s
  s=s.replace('func llmProxy(c *gin.Context) {','func llmProxy(c *gin.Context) {\n\tc.Set("model_performance_start", time.Now())')
  marker='\tenqueueLLMLogInsert(*llmLog)'
  assert marker in s;s=s.replace(marker,marker+'\n\tperformance := installModelPerformance(c)\n\tdefer func() { c.Writer = performance.ResponseWriter }()')
  marker='\tfinalUsage := usage.normalized(origReqData)'
  if marker not in s:
   s=s.replace('\tllmSettle(c, ch, origReqData, usage.normalized(origReqData),',marker+'\n\tllmSettle(c, ch, origReqData, finalUsage,')
  assert marker in s
  s=s.replace(marker,marker+'\n\tperformance.addUsage(finalUsage, time.Now())')
  p.write_text(s,encoding='utf-8')
if root.resolve()!=repo.resolve():
 for rel in ['internal/handler/model_performance.go','internal/handler/model_performance_test.go','internal/handler/model_availability.go','internal/handler/model_availability_test.go']:
  shutil.copyfile(repo/rel,root/rel)
 p=root/'web/app/src/lib/api/user.ts';s=p.read_text(encoding='utf-8-sig');s=s.replace('  p50_latency_ms: number','  p50_latency_ms: number\n  ttft_ms: number | null\n  tps: number | null\n  ttft_samples: number\n  tps_samples: number');p.write_text(s,encoding='utf-8')
 p=root/'web/app/src/pages/user/UserModelsPage.tsx';s=p.read_text(encoding='utf-8-sig');local=(repo/'web/app/src/pages/user/UserModelsPage.tsx').read_text(encoding='utf-8-sig');a='function ModelAvailabilityPanel(';b='function shouldUseChineseExamples(';s=s[:s.index(a)]+local[local.index(a):local.index(b)]+s[s.index(b):];p.write_text(s,encoding='utf-8')

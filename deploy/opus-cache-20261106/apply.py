from pathlib import Path
import hashlib,sys
p=Path(sys.argv[1])/"internal/handler/llm_stream.go"
assert hashlib.sha256(p.read_bytes()).hexdigest()=='520b4bfe4197b2b2bc35ef4947de8ef3e8e580903b7fb7f526afbec39a2f390d'
s=p.read_text(encoding="utf-8")
needle='\t\t\tcase "message_delta":\n\t\t\t\tif usg, ok := chunk["usage"].(map[string]interface{}); ok {\n'
addition='\t\t\t\t\t// Some upstreams finalize input and cache usage only at the end.\n\t\t\t\t\t// Missing fields preserve the start values; explicit zero replaces them.\n\t\t\t\t\tfor key, dest := range map[string]*int64{\n\t\t\t\t\t\t"input_tokens":                &u.promptTokens,\n\t\t\t\t\t\t"cache_creation_input_tokens": &u.cacheCreationTokens,\n\t\t\t\t\t\t"cache_read_input_tokens":     &u.cacheReadTokens,\n\t\t\t\t\t} {\n\t\t\t\t\t\tif n, ok := usg[key].(float64); ok && n >= 0 {\n\t\t\t\t\t\t\t*dest = int64(n)\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n'
assert s.count(needle)==1
p.write_text(s.replace(needle,needle+addition),encoding="utf-8")

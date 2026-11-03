package handler

import "testing"

func TestParsePingRTT(t *testing.T) {
	for _, tc := range []struct {
		name, output string
		ms           float64
		less, ok     bool
	}{
		{"linux", "64 bytes from 168.222.0.176: icmp_seq=1 ttl=52 time=42.37 ms", 42.37, false, true},
		{"windows", "Reply from 168.222.0.176: bytes=32 time=42ms TTL=52", 42, false, true},
		{"submillisecond", "来自 168.222.0.176 的回复: 字节=32 时间<1ms TTL=52", 1, true, true},
		{"decimal comma", "time=42,5 ms", 42.5, false, true},
		{"timeout", "Request timed out.", 0, false, false},
		{"unreachable", "From 10.0.0.1 icmp_seq=1 Destination Host Unreachable", 0, false, false},
		{"permission", "ping: socket: Operation not permitted", 0, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ms, less, ok := parsePingRTT(tc.output)
			if ms != tc.ms || less != tc.less || ok != tc.ok {
				t.Fatalf("got (%v, %v, %v), want (%v, %v, %v)", ms, less, ok, tc.ms, tc.less, tc.ok)
			}
		})
	}
}

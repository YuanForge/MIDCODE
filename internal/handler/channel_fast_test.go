package handler

import (
	"testing"

	"fanapi/internal/model"
)

func TestValidateChannelFastRatio(t *testing.T) {
	for name, tc := range map[string]struct {
		value   interface{}
		wantErr bool
	}{
		"missing":  {value: nil},
		"valid":    {value: 1.75},
		"string":   {value: "2.0"},
		"zero":     {value: 0, wantErr: true},
		"negative": {value: -1, wantErr: true},
		"too high": {value: 101, wantErr: true},
		"invalid":  {value: "fast", wantErr: true},
	} {
		t.Run(name, func(t *testing.T) {
			cfg := model.JSON{}
			if tc.value != nil {
				cfg["fast_ratio"] = tc.value
			}
			err := validateChannelFastRatio(&model.Channel{BillingConfig: cfg})
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}

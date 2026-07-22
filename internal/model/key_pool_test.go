package model

import (
	"reflect"
	"strings"
	"testing"
)

func TestKeyPoolDefaultChannelIsNullable(t *testing.T) {
	field, ok := reflect.TypeOf(KeyPool{}).FieldByName("ChannelID")
	if !ok {
		t.Fatal("ChannelID field is missing")
	}
	if field.Type.Kind() != reflect.Pointer || field.Type.Elem().Kind() != reflect.Int64 {
		t.Fatalf("ChannelID type = %s, want *int64", field.Type)
	}
	if tag := field.Tag.Get("xorm"); !strings.Contains(tag, "null") || strings.Contains(tag, "notnull") {
		t.Fatalf("ChannelID xorm tag = %q, want nullable", tag)
	}
}

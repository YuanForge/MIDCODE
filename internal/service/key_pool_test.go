package service

import (
	"reflect"
	"testing"

	"xorm.io/builder"
)

func TestNormalizeKeyPoolChannelIDs(t *testing.T) {
	got, err := normalizeKeyPoolChannelIDs([]int64{9, 3})
	if err != nil || len(got) != 2 || got[0] != 3 || got[1] != 9 {
		t.Fatalf("normalized=%v err=%v", got, err)
	}
	if _, err := normalizeKeyPoolChannelIDs([]int64{3, 3}); err == nil {
		t.Fatal("duplicate channel IDs must fail")
	}
	if _, err := normalizeKeyPoolChannelIDs([]int64{0}); err == nil {
		t.Fatal("non-positive channel IDs must fail")
	}
}

func TestKeyPoolDefaultChannelExclusionConditionExpandsIDs(t *testing.T) {
	condition := keyPoolDefaultChannelExclusionCondition([]int64{44, 43}, 45)
	_, args, err := builder.ToSQL(condition)
	if err != nil {
		t.Fatal(err)
	}
	want := []interface{}{int64(44), int64(43), int64(45)}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

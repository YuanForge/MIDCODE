package service

import (
	"errors"
	"testing"
	"time"
)

func TestCanBindInvite(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name       string
		createdAt  time.Time
		inviterSet bool
		want       bool
	}{
		{name: "new user", createdAt: now.Add(-6 * 24 * time.Hour), want: true},
		{name: "exactly seven days old", createdAt: now.Add(-7 * 24 * time.Hour), want: false},
		{name: "older user", createdAt: now.Add(-8 * 24 * time.Hour), want: false},
		{name: "already bound", createdAt: now.Add(-time.Hour), inviterSet: true, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var inviterID *int64
			if tt.inviterSet {
				value := int64(9)
				inviterID = &value
			}
			if got := canBindInvite(tt.createdAt, inviterID, now); got != tt.want {
				t.Fatalf("canBindInvite() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidateInviteParentChain(t *testing.T) {
	parentOf := func(parents map[int64]int64) func(int64) (int64, bool) {
		return func(id int64) (int64, bool) {
			parent, ok := parents[id]
			return parent, ok
		}
	}

	tests := []struct {
		name      string
		userID    int64
		inviterID int64
		parents   map[int64]int64
		wantErr   error
	}{
		{name: "self", userID: 1, inviterID: 1, parents: map[int64]int64{}, wantErr: ErrInviteSelf},
		{name: "direct cycle", userID: 1, inviterID: 2, parents: map[int64]int64{2: 1}, wantErr: ErrInviteCycle},
		{name: "long cycle", userID: 1, inviterID: 2, parents: map[int64]int64{2: 3, 3: 4, 4: 1}, wantErr: ErrInviteCycle},
		{name: "cycle within inviter chain", userID: 1, inviterID: 2, parents: map[int64]int64{2: 3, 3: 4, 4: 2}, wantErr: ErrInviteCycle},
		{name: "existing ancestor repetition", userID: 1, inviterID: 2, parents: map[int64]int64{2: 3, 3: 3}, wantErr: ErrInviteCycle},
		{name: "valid chain", userID: 1, inviterID: 2, parents: map[int64]int64{2: 3, 3: 4}, wantErr: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateInviteParentChain(tt.userID, tt.inviterID, parentOf(tt.parents))
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("validateInviteParentChain() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

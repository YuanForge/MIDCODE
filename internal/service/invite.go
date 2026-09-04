package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

const inviteBindingWindow = 7 * 24 * time.Hour

var (
	ErrInviteCodeRequired   = errors.New("邀请码不能为空")
	ErrInviteCodeInvalid    = errors.New("邀请码无效")
	ErrInviteAlreadyBound   = errors.New("您已经绑定过上级，不能重复绑定")
	ErrInviteBindingExpired = errors.New("注册已超过 7 天，不能再绑定邀请码")
	ErrInviteSelf           = errors.New("不能绑定自己的邀请码")
	ErrInviteCycle          = errors.New("不能形成邀请循环")
	ErrInviteChainInvalid   = errors.New("邀请链无效，请联系管理员")
)

// canBindInvite reports whether a user may set an inviter at now.
func canBindInvite(createdAt time.Time, inviterID *int64, now time.Time) bool {
	if inviterID != nil || createdAt.IsZero() || now.Before(createdAt) {
		return false
	}
	return now.Sub(createdAt) < inviteBindingWindow
}

// CanBindInvite is the public form used by HTTP handlers when presenting the
// binding window to a user.
func CanBindInvite(createdAt time.Time, inviterID *int64, now time.Time) bool {
	return canBindInvite(createdAt, inviterID, now)
}

// InviteBindingDeadline returns the exclusive end of the seven-day window.
func InviteBindingDeadline(createdAt time.Time) time.Time {
	return createdAt.Add(inviteBindingWindow)
}

// validateInviteParentChain rejects self-links and every cycle reachable from
// inviterID. parentOf should return (parentID, true) for a node with a parent;
// false means the node is a root and terminates the chain.
func validateInviteParentChain(userID, inviterID int64, parentOf func(int64) (int64, bool)) error {
	if userID == inviterID {
		return ErrInviteSelf
	}
	seen := map[int64]bool{userID: true}
	for current := inviterID; current > 0; {
		if seen[current] {
			return ErrInviteCycle
		}
		seen[current] = true
		parent, ok := parentOf(current)
		if !ok || parent <= 0 {
			return nil
		}
		current = parent
	}
	return nil
}

// BindInviteCode binds a recently registered user to the user owning code.
// The transaction-wide advisory lock serializes all bindings, so two
// concurrent requests cannot create opposite or otherwise cyclic links.
func BindInviteCode(ctx context.Context, userID int64, code string) (int64, error) {
	if userID <= 0 {
		return 0, ErrInviteChainInvalid
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return 0, ErrInviteCodeRequired
	}

	sess := db.Engine.NewSession().Context(ctx)
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		return 0, err
	}
	rollback := true
	defer func() {
		if rollback {
			_ = sess.Rollback()
		}
	}()

	// All invite writes use the same lock, preventing A->B and B->A races.
	if _, err := sess.Exec("SELECT pg_advisory_xact_lock($1)", int64(20260901)); err != nil {
		return 0, err
	}

	var target model.User
	found, err := sess.ID(userID).Cols("id", "inviter_id", "created_at").Get(&target)
	if err != nil {
		return 0, err
	}
	if !found {
		return 0, ErrInviteChainInvalid
	}
	if target.InviterID != nil {
		return 0, ErrInviteAlreadyBound
	}
	if !canBindInvite(target.CreatedAt, nil, time.Now()) {
		return 0, ErrInviteBindingExpired
	}

	var inviter model.User
	found, err = sess.Where("invite_code = ?", code).Cols("id", "inviter_id").Get(&inviter)
	if err != nil {
		return 0, err
	}
	if !found {
		return 0, ErrInviteCodeInvalid
	}

	var chainErr error
	parentOf := func(id int64) (int64, bool) {
		var parent model.User
		ok, loadErr := sess.ID(id).Cols("id", "inviter_id").Get(&parent)
		if loadErr != nil {
			chainErr = loadErr
			return 0, false
		}
		if !ok {
			chainErr = ErrInviteChainInvalid
			return 0, false
		}
		if parent.InviterID == nil {
			return 0, false
		}
		return *parent.InviterID, true
	}
	if err := validateInviteParentChain(userID, inviter.ID, parentOf); err != nil {
		return 0, err
	}
	if chainErr != nil {
		return 0, chainErr
	}

	updated, err := sess.Where("id = ? AND inviter_id IS NULL", userID).
		Cols("inviter_id").Update(&model.User{InviterID: &inviter.ID})
	if err != nil {
		return 0, err
	}
	if updated != 1 {
		return 0, ErrInviteAlreadyBound
	}
	if err := sess.Commit(); err != nil {
		return 0, err
	}
	rollback = false
	return inviter.ID, nil
}

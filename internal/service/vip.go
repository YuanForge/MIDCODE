package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"fanapi/internal/billing"
	"fanapi/internal/db"
	"fanapi/internal/model"
	"xorm.io/xorm"
)

func init() {
	billing.RegisterVIPDiscountLookup(VIPDiscountBpsForGroup)
}

type VIPGroupWithStats struct {
	model.VIPGroup  `xorm:"extends"`
	UserCount       int64   `json:"user_count" xorm:"user_count"`
	DiscountPercent float64 `json:"discount_percent" xorm:"-"`
}

func parseInt64String(raw string) int64 {
	if raw == "" {
		return 0
	}
	value, _ := strconv.ParseInt(raw, 10, 64)
	return value
}

func ListVIPGroups(ctx context.Context, includeInactive bool) ([]VIPGroupWithStats, error) {
	rows := make([]VIPGroupWithStats, 0)
	where := ""
	if !includeInactive {
		where = "WHERE v.is_active = true"
	}
	sql := fmt.Sprintf(`
SELECT v.*,
       COALESCE(u.user_count, 0) AS user_count
FROM vip_groups v
LEFT JOIN (
    SELECT "group", COUNT(*) AS user_count
    FROM users
    WHERE "group" != ''
    GROUP BY "group"
) u ON u."group" = v.code
%s
ORDER BY v.recharge_threshold ASC, v.sort_order ASC, v.id ASC`, where)
	if err := db.Engine.SQL(sql).Find(&rows); err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].DiscountPercent = float64(rows[i].DiscountBps) / 100
	}
	return rows, nil
}

func CreateVIPGroup(ctx context.Context, group *model.VIPGroup) error {
	normalizeVIPGroup(group)
	if err := validateVIPGroup(group); err != nil {
		return err
	}
	_, err := db.Engine.Context(ctx).Insert(group)
	return err
}

func UpdateVIPGroup(ctx context.Context, group *model.VIPGroup) error {
	normalizeVIPGroup(group)
	if group.ID <= 0 {
		return fmt.Errorf("VIP 分组 ID 不能为空")
	}
	if err := validateVIPGroup(group); err != nil {
		return err
	}
	affected, err := db.Engine.Context(ctx).ID(group.ID).
		Cols("code", "name", "recharge_threshold", "discount_bps", "sort_order", "description", "is_active").
		Update(group)
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("VIP 分组不存在")
	}
	return nil
}

func DeleteVIPGroup(ctx context.Context, id int64) error {
	if id <= 0 {
		return fmt.Errorf("VIP 分组 ID 不能为空")
	}
	affected, err := db.Engine.Context(ctx).ID(id).Delete(&model.VIPGroup{})
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("VIP 分组不存在")
	}
	return nil
}

func SetUserVIPGroup(ctx context.Context, userID int64, groupCode string) error {
	groupCode = strings.TrimSpace(groupCode)
	if userID <= 0 {
		return fmt.Errorf("用户 ID 不能为空")
	}
	if err := ValidateAssignableVIPGroup(ctx, groupCode); err != nil {
		return err
	}
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Context(ctx).Begin(); err != nil {
		return err
	}
	if err := SetUserVIPGroupTx(sess, userID, groupCode); err != nil {
		_ = sess.Rollback()
		return err
	}
	return sess.Commit()
}

func ValidateAssignableVIPGroup(ctx context.Context, groupCode string) error {
	groupCode = strings.TrimSpace(groupCode)
	if groupCode == "" {
		return fmt.Errorf("请选择 VIP 分组")
	}
	exists, err := db.Engine.Context(ctx).Where("code = ? AND is_active = true", groupCode).Exist(&model.VIPGroup{})
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("VIP 分组不存在或已停用")
	}
	return nil
}

func RefreshUserVIPGroup(ctx context.Context, userID int64) (string, int64, error) {
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Context(ctx).Begin(); err != nil {
		return "", 0, err
	}
	group, totalRecharge, err := refreshUserVIPGroupTx(sess, userID)
	if err != nil {
		_ = sess.Rollback()
		return "", 0, err
	}
	if err := sess.Commit(); err != nil {
		return "", 0, err
	}
	return group, totalRecharge, nil
}

func RefreshUserVIPGroupTx(sess *xorm.Session, userID int64) (string, int64, error) {
	return refreshUserVIPGroupTx(sess, userID)
}

func SetUserVIPGroupTx(sess *xorm.Session, userID int64, groupCode string) error {
	groupCode = strings.TrimSpace(groupCode)
	if userID <= 0 {
		return fmt.Errorf("用户 ID 不能为空")
	}
	if groupCode == "" {
		return fmt.Errorf("请选择 VIP 分组")
	}
	totalRecharge, err := totalRechargeForUserTx(sess, userID)
	if err != nil {
		return err
	}
	affected, err := sess.Exec(
		`UPDATE users SET "group" = $1, vip_recharge_baseline = $2 WHERE id = $3`,
		groupCode,
		totalRecharge,
		userID,
	)
	if err != nil {
		return err
	}
	if rows, _ := affected.RowsAffected(); rows == 0 {
		return fmt.Errorf("用户不存在")
	}
	return nil
}

func RefreshAllUserVIPGroups(ctx context.Context) (int64, error) {
	var users []model.User
	if err := db.Engine.Context(ctx).Cols("id").Find(&users); err != nil {
		return 0, err
	}

	var refreshed int64
	for _, user := range users {
		if _, _, err := RefreshUserVIPGroup(ctx, user.ID); err != nil {
			return refreshed, err
		}
		refreshed++
	}
	return refreshed, nil
}

func refreshUserVIPGroupTx(sess *xorm.Session, userID int64) (string, int64, error) {
	if userID <= 0 {
		return "", 0, fmt.Errorf("用户 ID 不能为空")
	}

	var user model.User
	found, err := sess.ID(userID).Cols("group", "vip_recharge_baseline").Get(&user)
	if err != nil {
		return "", 0, err
	}
	if !found {
		return "", 0, fmt.Errorf("用户不存在")
	}

	totalRecharge, err := totalRechargeForUserTx(sess, userID)
	if err != nil {
		return "", 0, err
	}
	upgradeRecharge := rechargeAfterBaseline(totalRecharge, user.VIPRechargeBase)

	var groups []model.VIPGroup
	if err := sess.
		Desc("recharge_threshold").
		Asc("sort_order").
		Asc("id").
		Find(&groups); err != nil {
		return "", 0, err
	}

	nextGroup, shouldUpdate := selectVIPUpgrade(user.Group, upgradeRecharge, groups)
	if !shouldUpdate {
		return user.Group, totalRecharge, nil
	}

	_, err = sess.Exec(`UPDATE users SET "group" = $1 WHERE id = $2`, nextGroup, userID)
	if err != nil {
		return "", 0, err
	}
	return nextGroup, totalRecharge, nil
}

func rechargeAfterBaseline(totalRecharge int64, baseline int64) int64 {
	if totalRecharge <= baseline {
		return 0
	}
	return totalRecharge - baseline
}

func selectVIPUpgrade(currentGroup string, totalRecharge int64, groups []model.VIPGroup) (string, bool) {
	var nextGroup model.VIPGroup
	hasNextGroup := false
	for _, group := range groups {
		if group.IsActive && totalRecharge >= group.RechargeThreshold {
			nextGroup = group
			hasNextGroup = true
			break
		}
	}
	if !hasNextGroup {
		return currentGroup, false
	}

	currentThreshold := int64(-1)
	for _, group := range groups {
		if group.Code == currentGroup {
			currentThreshold = group.RechargeThreshold
			break
		}
	}
	if currentGroup != "" && currentThreshold >= nextGroup.RechargeThreshold {
		return currentGroup, false
	}
	return nextGroup.Code, nextGroup.Code != currentGroup
}

func totalRechargeForUserTx(sess *xorm.Session, userID int64) (int64, error) {
	rows, err := sess.QueryString(`
SELECT COALESCE(SUM(GREATEST(credits - model_credit_charged, 0)), 0) AS total_recharge
FROM billing_transactions
WHERE user_id = $1 AND type = 'recharge'`, userID)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return parseInt64String(rows[0]["total_recharge"]), nil
}

func VIPDiscountBpsForGroup(group string) int64 {
	group = strings.TrimSpace(group)
	if group == "" || db.Engine == nil {
		return 10000
	}
	var vip model.VIPGroup
	found, err := db.Engine.Where("code = ? AND is_active = true", group).
		Cols("discount_bps").
		Get(&vip)
	if err != nil || !found {
		return 10000
	}
	if vip.DiscountBps <= 0 {
		return 10000
	}
	return vip.DiscountBps
}

func normalizeVIPGroup(group *model.VIPGroup) {
	group.Code = strings.TrimSpace(group.Code)
	group.Name = strings.TrimSpace(group.Name)
	group.Description = strings.TrimSpace(group.Description)
	if group.Name == "" {
		group.Name = group.Code
	}
	if group.DiscountBps == 0 {
		group.DiscountBps = 10000
	}
}

func validateVIPGroup(group *model.VIPGroup) error {
	if group.Code == "" {
		return fmt.Errorf("分组标识不能为空")
	}
	if strings.ContainsAny(group.Code, " \t\r\n") {
		return fmt.Errorf("分组标识不能包含空白字符")
	}
	if group.RechargeThreshold < 0 {
		return fmt.Errorf("储值门槛不能小于 0")
	}
	if group.DiscountBps <= 0 || group.DiscountBps > 10000 {
		return fmt.Errorf("折扣必须大于 0 且不超过 10000 基点")
	}
	return nil
}

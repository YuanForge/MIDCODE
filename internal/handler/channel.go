package handler

import (
	"net/http"
	"strconv"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
	"fanapi/internal/service"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const creditsPerCNY = 1_000_000.0

func creditsToCNY(credits int64) float64 {
	return float64(credits) / creditsPerCNY
}

func parseDateTime(value string, endOfDay bool) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	layouts := []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			if layout == "2006-01-02" && endOfDay {
				return t.Add(24*time.Hour - time.Nanosecond), nil
			}
			return t, nil
		}
	}
	return time.Time{}, strconv.ErrSyntax
}

// POST /admin/channels
func CreateChannel(c *gin.Context) {
	var ch model.Channel
	if err := c.ShouldBindJSON(&ch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.CreateChannel(c.Request.Context(), &ch); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, ch)
}

// GET /admin/channels
func ListChannels(c *gin.Context) {
	channels, err := service.ListChannels(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"channels": channels})
}

// PUT /admin/channels/:id
func UpdateChannel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var ch model.Channel
	if err := c.ShouldBindJSON(&ch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ch.ID = id
	if err := service.UpdateChannel(c.Request.Context(), &ch); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ch)
}

// PATCH /admin/channels/:id/active — 仅更新渠道启用状态，不影响其他字段
func PatchChannelActive(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		IsActive bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.PatchChannelActive(c.Request.Context(), id, req.IsActive); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /admin/channels/:id
func DeleteChannel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	if err := service.DeleteChannel(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "渠道已删除"})
}

// PUT /admin/users/:id/password — 管理员重置任意用户密码
func ResetUserPassword(c *gin.Context) {
	targetID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}
	affected, err := db.Engine.ID(targetID).Cols("password_hash").Update(&model.User{PasswordHash: string(hash)})
	if err != nil || affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
}

// POST /admin/users/:id/recharge — 为用户手动充值（直接填写 credits 数量）
func Recharge(c *gin.Context) {
	targetID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	adminID := c.MustGet("user_id").(int64)

	var req struct {
		Amount int64 `json:"amount" binding:"required,gt=0"` // credits 数量
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := service.Recharge(c.Request.Context(), targetID, adminID, req.Amount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"credited_credits": req.Amount,
		"credited_cny":     float64(req.Amount) / 1_000_000,
	})
}

// POST /admin/users/:id/model-credits — 为用户赠送专属模型积分
func GrantModelCredit(c *gin.Context) {
	targetID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		ModelName string `json:"model_name" binding:"required"`
		Credits   int64  `json:"credits" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := service.GrantModelCredit(c.Request.Context(), targetID, req.ModelName, req.Credits); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"model_name":       req.ModelName,
		"credited_credits": req.Credits,
		"credited_cny":     float64(req.Credits) / 1_000_000,
	})
}

// GET /admin/users/:id/model-credits — 查询用户的专属模型积分列表
func AdminListModelCredits(c *gin.Context) {
	targetID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	records, err := service.ListModelCredits(c.Request.Context(), targetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"model_credits": records})
}

// GET /admin/users — 用户列表（分页 + 复合筛选）
// 支持参数: email(模糊), uid, status(active/frozen), group, balance_min, balance_max,
//
//	created_after, created_before (YYYY-MM-DD 或 RFC3339)
func ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size <= 0 || size > 100 {
		size = 20
	}

	type adminUserRow struct {
		ID           int64    `json:"id"`
		Username     string   `json:"username"`
		Email        *string  `json:"email"`
		Role         string   `json:"role"`
		Group        string   `json:"group"`
		Balance      int64    `json:"balance"`
		IsActive     bool     `json:"is_active"`
		FrozenReason string   `json:"frozen_reason,omitempty"`
		RebateRatio  *float64 `json:"rebate_ratio,omitempty"`
		CreatedAt    string   `json:"created_at"`
		InviteCount  int64    `json:"invite_count"`
		TotalSpent   int64    `json:"total_spent"`
	}

	// 构建 WHERE 条件
	whereClauses := []string{"1=1"}
	args := []interface{}{}
	argIdx := 1

	if email := c.Query("email"); email != "" {
		whereClauses = append(whereClauses, "u.email ILIKE $"+strconv.Itoa(argIdx))
		args = append(args, "%"+email+"%")
		argIdx++
	}
	if uid := c.Query("uid"); uid != "" {
		whereClauses = append(whereClauses, "u.id = $"+strconv.Itoa(argIdx))
		args = append(args, uid)
		argIdx++
	}
	if status := c.Query("status"); status != "" {
		switch status {
		case "active":
			whereClauses = append(whereClauses, "u.is_active = true")
		case "frozen":
			whereClauses = append(whereClauses, "u.is_active = false")
		}
	}
	if group := c.Query("group"); group != "" {
		whereClauses = append(whereClauses, `u."group" = $`+strconv.Itoa(argIdx))
		args = append(args, group)
		argIdx++
	}
	if balMin := c.Query("balance_min"); balMin != "" {
		if v, err := strconv.ParseInt(balMin, 10, 64); err == nil {
			whereClauses = append(whereClauses, "u.balance >= $"+strconv.Itoa(argIdx))
			args = append(args, v*1_000_000)
			argIdx++
		}
	}
	if balMax := c.Query("balance_max"); balMax != "" {
		if v, err := strconv.ParseInt(balMax, 10, 64); err == nil {
			whereClauses = append(whereClauses, "u.balance <= $"+strconv.Itoa(argIdx))
			args = append(args, v*1_000_000)
			argIdx++
		}
	}
	if createdAfter, err := parseDateTime(c.Query("created_after"), false); err == nil && !createdAfter.IsZero() {
		whereClauses = append(whereClauses, "u.created_at >= $"+strconv.Itoa(argIdx))
		args = append(args, createdAfter)
		argIdx++
	}
	if createdBefore, err := parseDateTime(c.Query("created_before"), true); err == nil && !createdBefore.IsZero() {
		whereClauses = append(whereClauses, "u.created_at <= $"+strconv.Itoa(argIdx))
		args = append(args, createdBefore)
		argIdx++
	}

	where := ""
	for i, clause := range whereClauses {
		if i == 0 {
			where = "WHERE " + clause
		} else {
			where += " AND " + clause
		}
	}

	limitArg := argIdx
	offsetArg := argIdx + 1
	args = append(args, size, (page-1)*size)

	sql := `
SELECT
  u.id, u.username, u.email, u.role, u."group", u.balance, u.is_active, u.frozen_reason, u.rebate_ratio, u.created_at,
  COALESCE((SELECT COUNT(*) FROM users WHERE inviter_id = u.id), 0) AS invite_count,
  COALESCE((SELECT SUM(CASE WHEN type IN ('charge','hold','settle') THEN credits WHEN type = 'refund' THEN -credits ELSE 0 END) FROM billing_transactions WHERE user_id = u.id), 0) AS total_spent
FROM users u
` + where + `
ORDER BY u.id DESC
LIMIT $` + strconv.Itoa(limitArg) + ` OFFSET $` + strconv.Itoa(offsetArg)

	rows, err := db.Engine.QueryString(sql, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]adminUserRow, 0, len(rows))
	for _, r := range rows {
		id, _ := strconv.ParseInt(r["id"], 10, 64)
		balance, _ := strconv.ParseInt(r["balance"], 10, 64)
		inviteCount, _ := strconv.ParseInt(r["invite_count"], 10, 64)
		totalSpent, _ := strconv.ParseInt(r["total_spent"], 10, 64)
		isActive := r["is_active"] == "true" || r["is_active"] == "t" || r["is_active"] == "1"
		row := adminUserRow{
			ID:           id,
			Username:     r["username"],
			Role:         r["role"],
			Group:        r["group"],
			Balance:      balance,
			IsActive:     isActive,
			FrozenReason: r["frozen_reason"],
			CreatedAt:    r["created_at"],
			InviteCount:  inviteCount,
			TotalSpent:   totalSpent,
		}
		if email, ok := r["email"]; ok && email != "" {
			row.Email = &email
		}
		if ratioStr, ok := r["rebate_ratio"]; ok && ratioStr != "" {
			ratio, err := strconv.ParseFloat(ratioStr, 64)
			if err == nil {
				row.RebateRatio = &ratio
			}
		}
		result = append(result, row)
	}

	// 计算过滤后的总数
	countSQL := "SELECT COUNT(*) FROM users u " + where
	countArgs := args[:len(args)-2]
	total, _ := db.Engine.SQL(countSQL, countArgs...).Count()
	c.JSON(http.StatusOK, gin.H{"users": result, "total": total})
}

// PUT /admin/users/:id/group — 设置用户定价分组
func SetUserGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		Group string `json:"group"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := db.Engine.ID(id).Cols("group").Update(&model.User{Group: req.Group}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "group updated"})
}

// POST /admin/users — 管理员/运营创建用户账号
func CreateUser(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required,min=3,max=32"`
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
		Role     string `json:"role"` // 默认 "user"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	role := req.Role
	if role == "" {
		role = "user"
	}
	allowedRoles := map[string]bool{"user": true, "agent": true, "admin": true, "operator": true}
	if !allowedRoles[role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "角色值无效"})
		return
	}

	// 检查邮箱唯一性
	if exists, _ := db.Engine.Where("email = ?", req.Email).Exist(new(model.User)); exists {
		c.JSON(http.StatusConflict, gin.H{"error": "该邮箱已被注册"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}
	emailVal := req.Email
	inviteCode := service.GenerateInviteCode()
	user := &model.User{
		Username:     req.Username,
		Email:        &emailVal,
		PasswordHash: string(hash),
		Role:         role,
		IsActive:     true,
		InviteCode:   inviteCode,
	}
	if _, err := db.Engine.Insert(user); err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名或邮箱已被占用"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败，请稍后重试"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": user.ID, "username": user.Username, "email": user.Email})
}

// DELETE /admin/users/:id — 管理员硬删除用户（同时删除其所有 API Key）
// 仅 admin 角色可操作，operator 无此权限。
func DeleteUser(c *gin.Context) {
	// 只允许 admin 删除
	if role, _ := c.Get("role"); role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "仅管理员可删除用户"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}

	// 软验证：不允许删除 admin 账户，防止误删
	target := &model.User{}
	found, _ := db.Engine.ID(id).Cols("role").Get(target)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if target.Role == "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "不能删除管理员账户"})
		return
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务开启失败"})
		return
	}

	// 删除该用户的所有 API Key（硬删除）
	if _, err := sess.Where("user_id = ?", id).Delete(new(model.APIKey)); err != nil {
		sess.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除 API Key 失败"})
		return
	}
	// 硬删除用户
	if _, err := sess.ID(id).Delete(new(model.User)); err != nil {
		sess.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除用户失败"})
		return
	}
	if err := sess.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务提交失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "用户已删除"})
}

// isUniqueViolation 判断数据库错误是否为唯一约束冲突。
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "duplicate") || contains(msg, "unique")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && indexStr(s, sub) >= 0)
}

func indexStr(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// PATCH /admin/users/:id/freeze — 冻结或解冻账户
// 冻结后：用户无法登录，其 API Key 也无法使用。
func FreezeUser(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var req struct {
		Freeze bool   `json:"freeze"`
		Reason string `json:"reason"` // 冻结原因（解冻时可忽略）
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reason := ""
	if req.Freeze {
		reason = req.Reason
	}
	affected, err := db.Engine.ID(id).Cols("is_active", "frozen_reason").Update(&model.User{IsActive: !req.Freeze, FrozenReason: reason})
	if err != nil || affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	msg := "账户已冻结"
	if !req.Freeze {
		msg = "账户已解冻"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

// POST /admin/users/batch — 批量操作用户
// body: { "action": "freeze"|"unfreeze"|"set_group", "ids": [1,2,3], "group": "vip", "reason": "..." }
func BatchUpdateUsers(c *gin.Context) {
	var req struct {
		Action string  `json:"action" binding:"required"`
		IDs    []int64 `json:"ids" binding:"required,min=1"`
		Group  string  `json:"group"`
		Reason string  `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.IDs) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "单次批量不超过 200 个"})
		return
	}

	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务开启失败"})
		return
	}

	switch req.Action {
	case "freeze":
		if _, err := sess.In("id", req.IDs).Cols("is_active", "frozen_reason").
			Update(&model.User{IsActive: false, FrozenReason: req.Reason}); err != nil {
			sess.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "unfreeze":
		if _, err := sess.In("id", req.IDs).Cols("is_active", "frozen_reason").
			Update(&model.User{IsActive: true, FrozenReason: ""}); err != nil {
			sess.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	case "set_group":
		if req.Group == "" {
			sess.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "set_group 操作需要提供 group 值"})
			return
		}
		if _, err := sess.In("id", req.IDs).Cols("group").
			Update(&model.User{Group: req.Group}); err != nil {
			sess.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	default:
		sess.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 action: " + req.Action})
		return
	}

	if err := sess.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务提交失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "批量操作成功", "count": len(req.IDs)})
}

// GET /admin/transactions — 全局账单流水（分页）
func ListAllTransactions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	startAt, err := parseDateTime(c.Query("start_at"), false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_at 时间格式错误"})
		return
	}
	endAt, err := parseDateTime(c.Query("end_at"), true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_at 时间格式错误"})
		return
	}

	var txs []model.BillingTransaction
	query := db.Engine.Desc("id")
	if !startAt.IsZero() {
		query = query.Where("created_at >= ?", startAt)
	}
	if !endAt.IsZero() {
		query = query.And("created_at <= ?", endAt)
	}
	if txType := c.Query("type"); txType != "" {
		query = query.And("type = ?", txType)
	}
	if userID := c.Query("user_id"); userID != "" {
		query = query.And("user_id = ?", userID)
	}
	total, err := query.Limit(size, (page-1)*size).FindAndCount(&txs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type summaryRow struct {
		Revenue int64 `xorm:"'revenue'"`
		Cost    int64 `xorm:"'cost'"`
		Profit  int64 `xorm:"'profit'"`
		Count   int64 `xorm:"'count'"`
	}
	where := "WHERE 1=1"
	args := make([]interface{}, 0, 4)
	if !startAt.IsZero() {
		where += " AND created_at >= ?"
		args = append(args, startAt)
	}
	if !endAt.IsZero() {
		where += " AND created_at <= ?"
		args = append(args, endAt)
	}
	if txType := c.Query("type"); txType != "" {
		where += " AND type = ?"
		args = append(args, txType)
	}
	if userID := c.Query("user_id"); userID != "" {
		where += " AND user_id = ?"
		args = append(args, userID)
	}
	summary := summaryRow{}
	sql := `SELECT
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits
			WHEN type = 'refund' THEN -credits
			ELSE 0 END), 0) AS revenue,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN cost
			WHEN type = 'refund' THEN -cost
			ELSE 0 END), 0) AS cost,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits - cost
			WHEN type = 'refund' THEN -(credits - cost)
			ELSE 0 END), 0) AS profit,
		COUNT(*) AS count
	FROM billing_transactions ` + where
	if _, err := db.Engine.SQL(sql, args...).Get(&summary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type transactionView struct {
		ID           int64      `json:"id"`
		UserID       int64      `json:"user_id"`
		ChannelID    int64      `json:"channel_id"`
		APIKeyID     int64      `json:"api_key_id"`
		PoolKeyID    int64      `json:"pool_key_id"`
		CorrID       string     `json:"corr_id"`
		Type         string     `json:"type"`
		Amount       float64    `json:"amount"`
		Cost         float64    `json:"cost"`
		Profit       float64    `json:"profit"`
		BalanceAfter int64      `json:"balance_after"`
		Metrics      model.JSON `json:"metrics"`
		CreatedAt    time.Time  `json:"created_at"`
	}

	views := make([]transactionView, len(txs))
	for i, tx := range txs {
		profitCredits := int64(0)
		switch tx.Type {
		case "refund":
			profitCredits = -(tx.Credits - tx.Cost)
		case "charge", "settle", "hold":
			profitCredits = tx.Credits - tx.Cost
		}

		views[i] = transactionView{
			ID:           tx.ID,
			UserID:       tx.UserID,
			ChannelID:    tx.ChannelID,
			APIKeyID:     tx.APIKeyID,
			PoolKeyID:    tx.PoolKeyID,
			CorrID:       tx.CorrID,
			Type:         tx.Type,
			Amount:       creditsToCNY(tx.Credits),
			Cost:         creditsToCNY(tx.Cost),
			Profit:       creditsToCNY(profitCredits),
			BalanceAfter: tx.BalanceAfter,
			Metrics:      tx.Metrics,
			CreatedAt:    tx.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": views,
		"total":        total,
		"summary": gin.H{
			"revenue":           creditsToCNY(summary.Revenue),
			"cost":              creditsToCNY(summary.Cost),
			"profit":            creditsToCNY(summary.Profit),
			"transaction_count": summary.Count,
		},
	})
}

// GetAdminStats GET /admin/stats
func GetAdminStats(c *gin.Context) {
	totalChannels, _ := db.Engine.Count(new(model.Channel))
	activeChannels, _ := db.Engine.Where("is_active = true").Count(new(model.Channel))
	totalUsers, _ := db.Engine.Where("role = 'user'").Count(new(model.User))

	type sumRow struct {
		Revenue int64
		Cost    int64
		Count   int64
	}

	var todayRow, totalRow sumRow

	today := time.Now().Truncate(24 * time.Hour)
	// revenue = charge(图片/视频/音频一次性扣费) + settle(LLM实际结算) - refund(退款)
	// cost    = 对应类型的上游成本（refund 抄销对应的预写成本）
	db.Engine.SQL(`SELECT
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits
			WHEN type = 'refund' THEN -credits
			ELSE 0 END),0) AS revenue,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN cost
			WHEN type = 'refund' THEN -cost
			ELSE 0 END),0) AS cost,
		COUNT(*) AS count
	FROM billing_transactions
	WHERE type IN ('charge','settle','hold','refund') AND created_at >= ?`, today).Get(&todayRow)

	db.Engine.SQL(`SELECT
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN credits
			WHEN type = 'refund' THEN -credits
			ELSE 0 END),0) AS revenue,
		COALESCE(SUM(CASE
			WHEN type IN ('charge','settle','hold') THEN cost
			WHEN type = 'refund' THEN -cost
			ELSE 0 END),0) AS cost,
		COUNT(*) AS count
	FROM billing_transactions
	WHERE type IN ('charge','settle','hold','refund')`).Get(&totalRow)

	c.JSON(http.StatusOK, gin.H{
		"channels":        totalChannels,
		"active_channels": activeChannels,
		"users":           totalUsers,
		"today": gin.H{
			"revenue": todayRow.Revenue,
			"cost":    todayRow.Cost,
			"profit":  todayRow.Revenue - todayRow.Cost,
			"count":   todayRow.Count,
		},
		"total": gin.H{
			"revenue": totalRow.Revenue,
			"cost":    totalRow.Cost,
			"profit":  totalRow.Revenue - totalRow.Cost,
			"count":   totalRow.Count,
		},
	})
}

// GET /admin/stats/trend?days=7|30&dim=revenue|cost|profit|calls
// 返回近 N 天每日的指定维度数据
func GetAdminStatsTrend(c *gin.Context) {
	days := 7
	if d := c.Query("days"); d == "30" {
		days = 30
	}
	dim := c.DefaultQuery("dim", "revenue") // revenue / cost / profit / calls

	type dayRow struct {
		Day     string `xorm:"day"`
		Revenue int64  `xorm:"revenue"`
		Cost    int64  `xorm:"cost"`
		Calls   int64  `xorm:"calls"`
	}

	var rows []dayRow
	db.Engine.SQL(`
SELECT
  to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS day,
  COALESCE(SUM(CASE WHEN type IN ('charge','settle','hold') THEN credits WHEN type='refund' THEN -credits ELSE 0 END),0) AS revenue,
  COALESCE(SUM(CASE WHEN type IN ('charge','settle','hold') THEN cost WHEN type='refund' THEN -cost ELSE 0 END),0) AS cost,
  COUNT(*) AS calls
FROM billing_transactions
WHERE type IN ('charge','settle','hold','refund')
  AND created_at >= NOW() - INTERVAL '` + strconv.Itoa(days) + ` days'
GROUP BY day
ORDER BY day ASC
`).Find(&rows)

	type point struct {
		Label string  `json:"label"`
		Value float64 `json:"value"`
	}

	// 补全缺失的天（让曲线连续）
	now := time.Now().In(time.FixedZone("CST", 8*3600))
	dayMap := map[string]dayRow{}
	for _, r := range rows {
		dayMap[r.Day] = r
	}
	result := make([]point, 0, days)
	for i := days - 1; i >= 0; i-- {
		t := now.AddDate(0, 0, -i)
		label := t.Format("01-02")
		key := t.Format("2006-01-02")
		r := dayMap[key]
		var val float64
		switch dim {
		case "cost":
			val = creditsToCNY(r.Cost)
		case "profit":
			val = creditsToCNY(r.Revenue - r.Cost)
		case "calls":
			val = float64(r.Calls)
		default: // revenue
			val = creditsToCNY(r.Revenue)
		}
		result = append(result, point{Label: label, Value: val})
	}
	c.JSON(http.StatusOK, gin.H{"points": result, "dim": dim, "days": days})
}

// GET /admin/stats/top — 今日 TOP10 消耗用户、TOP 模型、TOP 渠道
func GetAdminStatsTop(c *gin.Context) {
	today := time.Now().Truncate(24 * time.Hour)

	type topRow struct {
		ID    string  `xorm:"id"`
		Name  string  `xorm:"name"`
		Value float64 `xorm:"value"`
	}

	var topUsers, topModels, topChannels []topRow

	db.Engine.SQL(`
SELECT u.id::text AS id, COALESCE(u.username, u.email::text, u.id::text) AS name,
       SUM(bt.credits)::float8 / 1000000 AS value
FROM billing_transactions bt
JOIN users u ON u.id = bt.user_id
WHERE bt.type IN ('charge','settle','hold') AND bt.created_at >= ?
GROUP BY u.id, u.username, u.email
ORDER BY value DESC LIMIT 10`, today).Find(&topUsers)

	db.Engine.SQL(`
SELECT COALESCE(ll.model,'(unknown)') AS id, COALESCE(ll.model,'(unknown)') AS name,
       COUNT(*)::float8 AS value
FROM llm_logs ll
WHERE ll.created_at >= ?
GROUP BY ll.model
ORDER BY value DESC LIMIT 10`, today).Find(&topModels)

	db.Engine.SQL(`
SELECT c.id::text AS id, COALESCE(c.display_name, c.name, c.id::text) AS name,
       COUNT(bt.id)::float8 AS value
FROM billing_transactions bt
JOIN channels c ON c.id = bt.channel_id
WHERE bt.type IN ('charge','settle','hold') AND bt.created_at >= ?
GROUP BY c.id, c.display_name, c.name
ORDER BY value DESC LIMIT 10`, today).Find(&topChannels)

	toList := func(rows []topRow) []gin.H {
		out := make([]gin.H, 0, len(rows))
		for _, r := range rows {
			out = append(out, gin.H{"id": r.ID, "name": r.Name, "value": r.Value})
		}
		return out
	}
	c.JSON(http.StatusOK, gin.H{
		"users":    toList(topUsers),
		"models":   toList(topModels),
		"channels": toList(topChannels),
	})
}

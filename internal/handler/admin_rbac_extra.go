package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/middleware"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

// GET /admin/me  返回当前管理员的基本信息和合并后的权限集
func GetAdminMe(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user model.User
	if found, _ := db.Engine.ID(userID).Cols("id", "username", "email", "role").Get(&user); !found {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
		return
	}

	permissions, err := middleware.AdminPermissions(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "权限查询失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user_id": user.ID, "username": user.Username, "email": user.Email, "role": user.Role, "permissions": permissions})
}

// GET /admin/key-pools/:id/channels  获取引用该号池的所有渠道
func GetKeyPoolChannels(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var channels []model.Channel
	db.Engine.Where("key_pool_id = ?", id).Find(&channels)
	c.JSON(http.StatusOK, gin.H{"channels": channels})
}

// GET /admin/roles
func ListRoles(c *gin.Context) {
	var roles []model.AdminRole
	db.Engine.OrderBy("id ASC").Find(&roles)
	c.JSON(http.StatusOK, gin.H{"roles": roles})
}

// POST /admin/roles
func CreateRole(c *gin.Context) {
	var r model.AdminRole
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r.IsBuiltin = false
	if _, err := db.Engine.Insert(&r); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, r)
}

// PUT /admin/roles/:id
func UpdateRole(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	var r model.AdminRole
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r.ID = id
	if _, err := db.Engine.ID(id).Cols("label", "permissions").Update(&r); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /admin/roles/:id
func DeleteRole(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}
	// 内置角色不允许删除
	var r model.AdminRole
	if found, _ := db.Engine.ID(id).Cols("is_builtin").Get(&r); !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
		return
	}
	if r.IsBuiltin {
		c.JSON(http.StatusForbidden, gin.H{"error": "内置角色不允许删除"})
		return
	}
	// 先清理绑定关系，再删除角色，避免孤儿数据
	db.Engine.Where("role_id = ?", id).Delete(&model.AdminUserRole{})
	db.Engine.Delete(&model.AdminRole{ID: id})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /admin/admins  列出所有管理员账号及其角色
func ListAdminUsers(c *gin.Context) {
	var users []model.User
	db.Engine.Where("role = ?", "admin").
		Cols("id", "username", "email", "created_at").
		OrderBy("id ASC").Find(&users)

	// 批量查询每位管理员绑定的角色
	type adminItem struct {
		ID        int64    `json:"id"`
		Username  string   `json:"username"`
		Email     *string  `json:"email"`
		RoleIDs   []int64  `json:"role_ids"`
		RoleNames []string `json:"role_names"`
	}

	if len(users) == 0 {
		c.JSON(http.StatusOK, gin.H{"admins": []adminItem{}})
		return
	}

	adminIDs := make([]interface{}, 0, len(users))
	for _, u := range users {
		adminIDs = append(adminIDs, u.ID)
	}

	var userRoles []model.AdminUserRole
	db.Engine.In("admin_id", adminIDs...).Find(&userRoles)

	// 收集需要查询的 role_ids
	roleIDSet := map[int64]bool{}
	for _, ur := range userRoles {
		roleIDSet[ur.RoleID] = true
	}
	roleIDSlice := make([]interface{}, 0, len(roleIDSet))
	for rid := range roleIDSet {
		roleIDSlice = append(roleIDSlice, rid)
	}

	roleMap := map[int64]string{}
	if len(roleIDSlice) > 0 {
		var roles []model.AdminRole
		db.Engine.In("id", roleIDSlice...).Cols("id", "name").Find(&roles)
		for _, r := range roles {
			roleMap[r.ID] = r.Name
		}
	}

	// 按 admin_id 分组
	rolesOf := map[int64][]int64{}
	for _, ur := range userRoles {
		rolesOf[ur.AdminID] = append(rolesOf[ur.AdminID], ur.RoleID)
	}

	items := make([]adminItem, 0, len(users))
	for _, u := range users {
		rIDs := rolesOf[u.ID]
		rNames := make([]string, 0, len(rIDs))
		for _, rid := range rIDs {
			if name, ok := roleMap[rid]; ok {
				rNames = append(rNames, name)
			}
		}
		items = append(items, adminItem{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			RoleIDs:   rIDs,
			RoleNames: rNames,
		})
	}
	c.JSON(http.StatusOK, gin.H{"admins": items})
}

// PUT /admin/admins/:id/roles  设置管理员绑定的角色（全量替换）
func SetAdminRoles(c *gin.Context) {
	adminID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID 格式错误"})
		return
	}

	var req struct {
		RoleIDs []int64 `json:"role_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 校验被操作的用户确实是 admin 角色
	var target model.User
	found, _ := db.Engine.ID(adminID).Cols("id", "role").Get(&target)
	if !found || target.Role != "admin" {
		c.JSON(http.StatusNotFound, gin.H{"error": "管理员不存在"})
		return
	}

	// 在事务内全量替换：先删全部旧绑定，再逐条插入
	sess := db.Engine.NewSession()
	defer sess.Close()
	if err := sess.Begin(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "事务开启失败"})
		return
	}
	if _, err := sess.Where("admin_id = ?", adminID).Delete(&model.AdminUserRole{}); err != nil {
		_ = sess.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, rid := range req.RoleIDs {
		if _, err := sess.Insert(&model.AdminUserRole{AdminID: adminID, RoleID: rid}); err != nil {
			_ = sess.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if err := sess.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

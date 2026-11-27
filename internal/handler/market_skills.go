package handler

import (
	"fanapi/internal/db"
	"fanapi/internal/model"
	"github.com/gin-gonic/gin"
	"regexp"
	"strconv"
	"strings"
)

var skillLink = regexp.MustCompile(`^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+(/(tree|blob)/[A-Za-z0-9_./-]+)?$`)

func SubmitSkill(c *gin.Context) {
	var body struct {
		URL string `json:"url"`
	}
	if c.ShouldBindJSON(&body) != nil {
		c.JSON(400, gin.H{"error": "请输入 GitHub 地址"})
		return
	}
	link := strings.TrimRight(strings.TrimSpace(body.URL), "/")
	if len(link) > 1024 || !skillLink.MatchString(link) || strings.Contains(link+"/", "/../") || strings.Contains(link+"/", "/./") {
		c.JSON(400, gin.H{"error": "请输入有效的 GitHub 仓库、目录或文件地址"})
		return
	}
	skill := model.MarketSkill{UserID: c.GetInt64("user_id"), URL: link, Status: "pending"}
	if _, err := db.Engine.Insert(&skill); err != nil {
		c.JSON(500, gin.H{"error": "提交失败"})
		return
	}
	c.JSON(201, skill)
}

func SkillsList(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows := []model.MarketSkill{}
		query := db.Engine.Context(c.Request.Context()).Desc("id")
		switch scope {
		case "market":
			query.Where("status = ?", "approved")
		case "mine":
			query.Where("user_id = ?", c.GetInt64("user_id"))
		case "review":
			query.Where("status = ?", "pending")
		}
		if err := query.Find(&rows); err != nil {
			c.JSON(500, gin.H{"error": "读取列表失败"})
			return
		}
		c.JSON(200, rows)
	}
}

func ReviewSkill(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Status string `json:"status"`
	}
	if err != nil || c.ShouldBindJSON(&body) != nil || (body.Status != "approved" && body.Status != "rejected") {
		c.JSON(400, gin.H{"error": "审核参数无效"})
		return
	}
	n, err := db.Engine.ID(id).Where("status = ?", "pending").Cols("status").Update(&model.MarketSkill{Status: body.Status})
	if err != nil {
		c.JSON(500, gin.H{"error": "审核失败"})
		return
	}
	if n == 0 {
		c.JSON(409, gin.H{"error": "该提交已处理或不存在"})
		return
	}
	c.Status(204)
}

-- 更新内置角色权限集（对齐 2026-05-12 权限配置表）
-- 权限点命名规范：<模块>:<操作>
--   dashboard:users/channels/revenue/trend
--   channels:read/write
--   keypools:read/write
--   users:read/write/recharge/recharge_approve
--   billing:read/export/adjust
--   tasks:read/write
--   logs:read/export
--   cards:read/write
--   withdraw:read/review/approve
--   settings:write/payment/vendor/announce
--   audit:self/all

-- 客服：用户服务、提现初审、有限查看
UPDATE admin_roles SET
  label       = '客服',
  permissions = '["dashboard:users","users:read","users:write","users:recharge","tasks:read","logs:read","cards:read","withdraw:read","withdraw:review","settings:announce","audit:self"]'
WHERE name = 'support' AND is_builtin = TRUE;

-- 财务：核心财务操作 + 审批权
UPDATE admin_roles SET
  label       = '财务',
  permissions = '["dashboard:users","dashboard:channels","dashboard:revenue","dashboard:trend","channels:read","users:read","users:write","users:recharge_approve","billing:read","billing:export","billing:adjust","tasks:read","logs:read","logs:export","cards:read","cards:write","withdraw:read","withdraw:approve","settings:payment","settings:announce","audit:self"]'
WHERE name = 'finance' AND is_builtin = TRUE;

-- 运营（保留，给内容/增长团队用）
UPDATE admin_roles SET
  label       = '运营',
  permissions = '["dashboard:users","dashboard:channels","dashboard:trend","users:read","users:write","tasks:read","tasks:write","logs:read","cards:read","audit:self"]'
WHERE name = 'operator' AND is_builtin = TRUE;

-- 只读
UPDATE admin_roles SET
  permissions = '["dashboard:users","dashboard:channels","dashboard:trend","channels:read","keypools:read","users:read","billing:read","tasks:read","logs:read","cards:read","withdraw:read","audit:self"]'
WHERE name = 'readonly' AND is_builtin = TRUE;

-- 新增：采购（号池/渠道管理）
INSERT INTO admin_roles (name, label, permissions, is_builtin) VALUES
  ('procurement', '采购',
   '["dashboard:channels","dashboard:trend","channels:read","channels:write","keypools:read","keypools:write","billing:export","tasks:read","tasks:write","logs:read","withdraw:read","settings:vendor","audit:self"]',
   TRUE)
ON CONFLICT (name) DO UPDATE SET
  label       = EXCLUDED.label,
  permissions = EXCLUDED.permissions;

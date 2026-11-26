export type RoleForm = { name: string; label: string; permissions: string[] }

export const emptyRoleForm: RoleForm = { name: '', label: '', permissions: [] }

// 所有可分配的权限点（与后端 RBAC 约定一致）
export const ALL_PERMISSIONS = [
  'dashboard:users', // 今日新增用户 / 提现卡片
  'dashboard:channels', // 渠道 / 成本 / Key 健康
  'dashboard:revenue', // 收入 / 成本 / 利润（财务核心）
  'dashboard:trend', // 趋势曲线 / TOP 榜
  'channels:read',
  'channels:write',
  'keypools:read',
  'keypools:write',
  'users:read',
  'users:write', // 重置密码 / 冻结 / 分组 / 风控标签
  'users:recharge', // 充值 / 赠分（发起申请）
  'users:recharge_approve', // 充值 / 赠分（审批生效） + 退款审批 + 删除用户
  'billing:read',
  'billing:export',
  'billing:adjust', // 手动补单 / 冲销（需留操作备注）
  'tasks:read',
  'tasks:write', // 告警配置
  'logs:read',
  'logs:export',
  'cards:read',
  'cards:write', // 生成 / 作废 / 导出（财务）
  'withdraw:read',
  'withdraw:review', // 初审（客服）
  'withdraw:approve', // 复审 + 打款（财务）
  'settings:write', // 基本设置（仅超管分配）
  'settings:payment', // 支付 / 套餐 / 返佣
  'settings:vendor', // 号商设置
  'settings:announce', // 公告 / 联系
  'audit:self', // 查看自己的操作记录
  'audit:all', // 查看全部审计日志（仅超管分配）
]

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard:users': '概览 - 用户统计',
  'dashboard:channels': '概览 - 渠道健康',
  'dashboard:revenue': '概览 - 收入利润',
  'dashboard:trend': '概览 - 趋势图表',
  'channels:read': '渠道 - 查看',
  'channels:write': '渠道 - 管理',
  'keypools:read': '号池 - 查看',
  'keypools:write': '号池 - 管理',
  'users:read': '用户 - 查看',
  'users:write': '用户 - 管理',
  'users:recharge': '用户 - 充值申请',
  'users:recharge_approve': '用户 - 充值审批',
  'billing:read': '账单 - 查看',
  'billing:export': '账单 - 导出',
  'billing:adjust': '账单 - 手动补单',
  'tasks:read': '任务 - 查看',
  'tasks:write': '任务 - 管理',
  'logs:read': '日志 - 查看',
  'logs:export': '日志 - 导出',
  'cards:read': '卡密 - 查看',
  'cards:write': '卡密 - 管理',
  'withdraw:read': '提现 - 查看',
  'withdraw:review': '提现 - 初审',
  'withdraw:approve': '提现 - 复审打款',
  'settings:write': '设置 - 基本设置',
  'settings:payment': '设置 - 支付套餐',
  'settings:vendor': '设置 - 号商管理',
  'settings:announce': '设置 - 公告联系',
  'audit:self': '审计 - 自己的日志',
  'audit:all': '审计 - 全部日志',
}

const GROUP_TITLES: Record<string, string> = {
  dashboard: '数据概览',
  channels: '渠道',
  keypools: '号池',
  users: '用户',
  billing: '账单',
  tasks: '任务',
  logs: '日志',
  cards: '卡密',
  withdraw: '提现',
  settings: '系统设置',
  audit: '审计',
}

/** Inside a group the module name is already the heading, so only the part after it is shown. */
function shortLabel(key: string) {
  return (PERMISSION_LABELS[key] ?? key).split(' - ').pop() ?? key
}

export const PERMISSION_GROUPS = Object.entries(GROUP_TITLES).map(([prefix, title]) => ({
  prefix,
  title,
  items: ALL_PERMISSIONS.filter((key) => key.startsWith(`${prefix}:`)).map((key) => ({ key, label: shortLabel(key) })),
}))

# DNS 切换清单

目标 IPv4：`103.145.190.198`。仅修改以下现有域名对应的源站 A 记录；
若通过 CNAME 指向统一源站，调整对应源站记录，避免同时配置冲突记录。
若存在旧 AAAA 记录，先核对，不能让 IPv6 用户继续访问不匹配的源站。
现有 Cloudflare 代理状态保持不变。

## 可切换：MIDCODE

```text
midcode.cc
www.midcode.cc
ai.midcode.cc
origin-hk.midcode.cc
ai.midaccs.com
www.midaccs.com
```

## 可切换：OctoAPI 及站点

```text
octoapi.xyz
www.octoapi.xyz
platform.octoapi.xyz
assets.octoapi.xyz
max.octoapi.xyz
maxkim.octoapi.xyz
o1.octoapi.xyz
qianyuan.octoapi.xyz
testjeff.octoapi.xyz
8880.hair
pipe-code.xyz
model.lcgxlm.com
model.compute-origin.com
```

以上 19 个域名均用原域名 Host/SNI 定向连接新机验证：首页 200；其中
18 个 HTTPS 证书验证通过，`model.compute-origin.com` 保持原 HTTP 服务。
MIDCODE 和 OctoAPI 认证接口也已通过新机 HTTPS 入口验证。

## 保持旧解析

- `image.midcode.cc`：图片和视频共用域名；按最新决定保留旧视频，不等待、不暂停。
- `shop.fanapi.cc`：商城不在本轮迁移范围。
- `sub.midaccs.com`：上游号池域名，不是本次业务源站，不能改成新机。

DNS 更新按缓存/TTL 逐步生效，不是所有请求立即同时切换。
缓存旧地址的用户仍由旧机自己的业务服务处理；解析到新地址的用户由
新机业务服务处理。两边共用第三台服务器的数据服务。
因为图片、视频和商城仍在旧机，**目前不能关闭旧机**。

新机使用已迁移的有效证书；自动续期接管尚未完成，不能把手动加载证书
误认为已配置 Caddy 自动续期。域名解析生效后需要完成续期配置与验证。

# 迁回旧服务器：域名解析清单（2026-11-13）

目标 IPv4：`140.150.236.134`。修改现有 A 记录的源站地址；若域名通过 CNAME 指向统一源站，只修改对应源站记录。保留现有 Cloudflare 代理开关。核对 AAAA，避免 IPv6 流量仍到另一台服务器。

## FanAPI / MIDCODE

- midcode.cc
- www.midcode.cc
- ai.midcode.cc
- origin-hk.midcode.cc
- ai.midaccs.com
- www.midaccs.com
- image.midcode.cc（图片、视频工作台）

## OctoAPI

- octoapi.xyz
- www.octoapi.xyz
- platform.octoapi.xyz
- assets.octoapi.xyz
- max.octoapi.xyz
- maxkim.octoapi.xyz
- o1.octoapi.xyz
- qianyuan.octoapi.xyz
- testjeff.octoapi.xyz
- 8880.hair
- pipe-code.xyz
- model.lcgxlm.com
- model.compute-origin.com（保留 HTTP）

## 监控站

- monitor.fanapi.cc

不要改动数据库、共享存储或上游域名（例如 s3.fanapi.cc、sub.midaccs.com）。shop.fanapi.cc 的旧服务器服务保留，不覆盖商城数据。api.fanapi.cc 的既有旧域名入口也保留，若已经指向旧服务器则无需调整。

解析由用户操作，本任务没有更改 DNS。新服务器主站/API、OctoAPI 和监控站暂时继续承接 DNS 缓存流量；其工作台入口已经转发到旧服务器，确保本地工作台状态只有一个写入端。在 DNS 缓存排空及其他保留服务依赖核对前，不能直接关闭新服务器。

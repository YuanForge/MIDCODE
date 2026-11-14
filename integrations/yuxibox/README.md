# YuxiBox Seedance 视频渠道

读取文档日期：2026-10-19。沿用 FanAPI `POST /v1/video` 和 `GET /v1/tasks/{task_id}`；上游为 `POST https://yuxibox.cn/v1/videos`、`GET /v1/videos/{id}`，使用同一号池令牌查询。

| 模型 | 时长（秒） | 默认 | 基础成本 | 基础售价 |
| --- | --- | --- | --- | --- |
| seedance-2.5（YX） | 4–30 | 30 | ¥0.30/秒 | ¥0.51/秒 |
| seedance-2.5（YX）-按次 | 固定 30 | 30 | ¥3.50/次 | ¥5.95/次 |
| seedance-2.0（官渠） | 4–15 | 15 | ¥2.60/次 | ¥4.42/次 |
| seedance-2.0（YX） | 5/10/15 | 15 | ¥0.25/秒 | ¥0.425/秒 |
| seedance2.5-yx-count | 4–30 | 30 | ¥4.00/次 | ¥6.80/次 |

`seedance2.5-yx-count` 的正文 4.5 元与定价栏 4 元冲突，用户已确认采用 4 元；2.5 的简介写 5 秒起，参数表写 4 秒起，此适配按参数表实现。实际成本仍受上游令牌分组倍率影响。

## 配置

`node integrations/yuxibox/build-channels.mjs` 从三个 JS 文件生成 `channels.json`（管理员创建渠道 API 的请求体数组）和 `seed.sql`。模板默认停用、不含密钥，`key_pool_id` 与 `model_provider_id` 必须绑定到目标站点的实际记录；模型企业为 Doubao。

启用前部署本次 API/worker 更新。`billing_config.normalize_request=true` 调用请求脚本的 `normalizeRequest`，在预估和实际扣费之前应用相同的校验与默认时长。售价和成本以内部 credits 存储（1 元 = 1,000,000 credits），管理界面按其既有显示规则填写。基础售价为成本的 1.7 倍，再由既有 VIP 计费逻辑按等级折扣，成本不参与 VIP 折扣。不把 VIP 折扣重复写进 `pricing_groups`。

官渠单独绑定有官渠权限的号池，其余四个模型绑定 YX 号池。将渠道加入 Doubao 的 Seedance 模型分组后，已绑定该分组的 API Key 才能调用。

## 参数

```json
{
  "model": "seedance-2.5（YX）",
  "prompt": "以 @Image1 为主体参考，镜头缓慢推进",
  "duration": "10",
  "size": "720p",
  "aspect_ratio": "16:9",
  "refer_images": ["https://example.com/image.png"],
  "audios": ["https://example.com/audio.mp3"]
}
```

也接受上游别名 `seconds`、`ratio`、`reference_images`、`videos`；别名与平台字段冲突时拒绝，避免计费和实际生成不一致。`duration` 沿用平台字符串格式，`seconds` 支持整数或整数字符串。`refer_audios` 可作为 `audios` 的别名。

固定输出 720P；`720p`、三种文档像素尺寸可转换为上游 `ratio`。官渠仅横/竖屏、不支持参考视频、data URL 和文件上传。YX 2.5 最多 30 图/10 视频/10 音频，YX 2.0 最多 9/3/3，官渠最多 9 图/3 音频。素材地址的公网可达性、格式和大小由上游校验。此接入使用 JSON；`input_reference` 支持 URL，不新增 multipart 客户端入口。

## 异步状态和重试

提交响应必须含非空 `id`，保存为 `upstream_task_id`。查询 `queued/in_progress` 保持处理中，`completed` 提取 `video_url` 或 `download_url`，`failed` 进入既有失败退款流程。完成但暂无有效下载地址时继续查询，不把需要鉴权的 `/content` 当作公共视频链接。

请求脚本输出内部控制字段 `_disable_submit_retry=true`，worker 不会把它发送上游；网络错误、504、鉴权失败或缺失任务 ID 不触发自动重发/换号池/换渠道。提交结果不确定时平台按失败退款，管理员应核对上游记录，不能据此推断上游未生成；已获得 ID 的任务继续 GET 轮询。现有轮询最长保留 2 小时。

## 验证

`go test ./internal/script ./internal/handler ./internal/billing ./internal/taskresult`

专项测试覆盖五模型默认费用、时长别名、参考素材和尺寸限制、查询状态与 URL、真实 HTTP 模拟提交、断线/504/缺失 ID 不重发，以及生成模板与源脚本一致性。不以这些测试代替真实收费生成验收。

文档：[2.5 YX](https://yuxibox.cn/docs/videos/seedance-2.5%EF%BC%88YX%EF%BC%89)、[2.5 固定按次](https://yuxibox.cn/docs/videos/seedance-2.5%EF%BC%88YX%EF%BC%89-%E6%8C%89%E6%AC%A1)、[2.0 官渠](https://yuxibox.cn/docs/videos/seedance-2.0%EF%BC%88%E5%AE%98%E6%B8%A0%EF%BC%89)、[2.0 YX](https://yuxibox.cn/docs/videos/seedance-2.0%EF%BC%88YX%EF%BC%89)、[2.5 灵活按次](https://yuxibox.cn/docs/videos/seedance2.5-yx-count)、[查询](https://yuxibox.cn/docs/general/task-query)。

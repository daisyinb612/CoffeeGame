# 视频理解接口观察记录

以下是 2026-11-14 通过 `vip.yinli.one` 中转接口的实际观察；`modelVersion` 来自接口响应，不代表已确认中转站内部如何路由。

| 输入 | 请求模型 | 返回 `modelVersion` | 结果 |
| --- | --- | --- | --- |
| 约 5 秒 | `gemini-4-argon` | `3.1-flash-lite-05-2026` | JSON 字符串中有非法换行 |
| 约 5 秒 | `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | JSON 有效 |
| 约 20 秒 | `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` | JSON 有效 |
| 约 20 秒，重试两次 | `gemini-3.1-pro-preview` | 均为 `3.1-flash-lite-05-2026` | 版本校验拒绝 |
| 约 30 秒 | `gemini-3.1-pro-preview` | `3.1-flash-lite-05-2026` | JSON 字符串中有非法换行 |
| 约 60 秒 | `gemini-3.1-pro-preview` | `3.1-flash-lite-05-2026` | JSON 字符串中有非法换行 |
| 约 20 秒 | `gemini-2.5-pro` | 无 | HTTP 503：当前分组无可用渠道 |
| 完整 10 分钟 | `gemini-4-argon` | 无 | 180 秒等待超时 |

返回 JSON 格式错误时，有的字段名或字符串中出现非转义换行；曾有 60 秒片段被写到第 100 秒。一次格式错误响应的 `finishReason` 是 `STOP`，因此不能简单归因于输出长度截断。当前只能确定**中转接口返回的版本与请求不总一致，且结构化格式不总可靠**；无法仅凭这些响应判断错误出在模型本身还是中转层。

测试时本地配置默认请求 `gemini-4-argon`，并非默认请求 Flash；此后已将项目默认模型改为 `gemini-3.1-pro-preview`。请求 Pro 时也曾返回 Flash Lite，且纯文本请求同样出现过，因此视频压缩、视频编码不是该现象的必要条件。New API 的[渠道配置文档](https://docs.newapi.pro/en/docs/guide/feature-guide/admin/channel)允许模型映射、同优先级渠道按权重选择；这提供了可能的解释，但无法证明 `vip.yinli.one` 当前采用哪一种配置。确定原因需要该站的请求日志或渠道配置。

## 同一段 30 秒视频的重复测试

在相同输入、相同 Pro 模型、未指定 temperature/seed 的条件下，旧提示词两次分别输出 6 段和 13 段。第二次将拿取与放下拆成独立动作，还出现了画面依据不足的“点击手表”。

改用“对一个物体完成一项操作”的分段规则后，两次分别输出 4 段和 5 段，均返回 `gemini-3.1-pro-preview`。动作粒度更接近，但仍有器具名称、起止时间差异：一次将玻璃杯称为“量杯”，另一次额外拆出了“拿取量杯和长匙”。因此提示词改善了分段粒度，并未证明识别结果稳定。测试文件见 `test/diagnostics/action_30s_{pro,grouped}_run{1,2}.json`。

`temperature` 控制生成时的随机程度，`seed` 指定生成使用的随机种子；它们都不能保证相同结果，也不能纠正视频识别错误。曾尝试对 60 秒请求设置 temperature=0，但中转接口返回的 `modelVersion` 变为 Flash Lite；另一次未设置参数的 30 秒请求也出现相同版本问题，不能据此归因于 temperature。两个参数目前保持可选，默认交给模型设置。

即便接口返回有效 JSON，动作和时间仍是模型判断。[Gemini 官方视频理解文档](https://ai.google.dev/gemini-api/docs/video-understanding)说明默认视觉采样约每秒一帧，快速或被遮挡的动作可能漏掉。剪辑边界必须对照原视频核准。

## 2026-11-15：输入方式与 Flash 测试

官方 [generateContent 视频文档](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)示例使用 `contents.parts[].inlineData` 传 MP4，视频后接文字提示；当前脚本的请求结构与该示例一致。官方建议较长视频或较大的请求改用 Files API：先上传，等文件为 `ACTIVE`，再用文件 URI 请求理解。中转站此前对 `/v1beta/files` 返回 404，因此当前连接尚未证实支持这条路径。10 分钟压缩片约 28.62 MiB，Base64 请求约 40 MB；一次直传在客户端写入阶段超时，没有收到 HTTP 响应，不能归因于 JSON 格式校验。

中转站模型列表包含 `gemini-3.1-flash-lite-preview` 与 `gemini-3.8-flash`。Lite 的短文本请求成功并返回 `gemini-3.1-flash-lite`，但 30 秒视频请求曾返回 503（当前分组无可用渠道）。同一 30 秒视频请求 `gemini-3.8-flash` 返回 200，`modelVersion` 也是 `gemini-3.8-flash`，并给出动作与候选转场区间；这证明短视频请求可用，不保证 10 分钟直传可用。Flash Lite 的一次结果把 `4–12` 秒误写为停顿，说明候选转场不能直接用作剪辑点。

完整视频的一次结果把 `09:55` 一类时间疑似写成 `955` 这样的“秒数”，最终输出延伸到 958 秒，超过 600 秒片长；`298` 等数值又不能直接解释为合法 `MM:SS`，因此没有自动转换旧结果。默认提示词已改为通用视频提示词：模型输出带冒号的时间戳，脚本换算成秒数。30 秒复测返回 `00:00`、`00:05` 等时间戳，换算后 5 个动作和 3 个转场候选均在视频时长内。一次连接中断后重试成功；这仅验证新格式在该短片上的表现。

## 长视频 Files API 路径

2026-11-16 按官方 resumable upload 协议探测引力 VIP 的 `/upload/v1beta/files`：HTTP 200 返回网站 HTML，没有 `X-Goog-Upload-URL`，不能作为 Gemini Files API 使用。Google 官方 API key 对 `GET /v1beta/models/gemini-3.8-flash` 返回 200；30 秒样本经官方 Files API 上传成功，文件从 `PROCESSING` 进入 `ACTIVE`。后续 `generateContent` 两次收到官方 503 高负载；一个纯文本生成请求也超时。这些是 Google 直连实验，不代表引力 VIP 的行为。2026-11-17 确认项目统一使用引力 VIP 后，主流程采用压缩后内嵌视频直接请求中转站 `generateContent`；完整 10 分钟请求尚未成功验证。

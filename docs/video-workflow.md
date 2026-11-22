# 视频理解工作流

```text
CoffeeGame/
├── coffeegame/
│   ├── steps/             压缩、抽音轨、转写、抽帧、GPT 分析、合并；每步可单独运行
│   ├── core/              接口配置、视频时长等共用代码
│   └── workflow.py        按顺序调用独立步骤
├── demo/                  竖屏短剧、关卡和字幕
├── docs/                  产品和接口记录
├── source/                本地原始素材
└── test/                  本地生成的分析副本和结果
```

主流程：`原视频 → 压缩 → 抽取音轨 → Gemini 逐句转写 → 抽取带时间戳的帧 → GPT 看帧并参考转写 → 合成最终 JSON`。GPT 请求使用 OpenAI 兼容的 Chat Completions 和图片帧；它没有收到原始 MP4 或音频，所以声音内容以独立转写为依据。

## 一条命令

在项目根目录运行：

```bash
python3 -m coffeegame.workflow --input source/冰美式第一人称视频.MP4
```

**最终查看 `final.json`**：每个动作段内含同时段的原声句子。`analysis.json` 是 GPT 动作分析，`transcript.json` 是 Gemini 逐句转写；另有 `compressed.mp4`、`audio.wav`、`frames/manifest.json` 和 `workflow.log`。结果写到 `test/workflow/<视频名>-<路径指纹>/`。可用 `--output` 指定最终文件，`--analysis-output`、`--transcript-output` 指定中间文件。GPT 默认每秒抽 1 帧、每 30 秒分析一次，可用 `--frame-fps`、`--chunk-seconds` 调整。日志记录每一步、HTTP 状态和耗时，不记录 token 或媒体内容。

已有同一视频的压缩文件和转写时，用 `--resume` 复用它们，只执行缺失的步骤；GPT 已完成的片段也按请求内容校验后复用。当前 10 分钟素材从旧结果切换到 GPT 时可运行：

```bash
python3 -m coffeegame.workflow --input source/冰美式第一人称视频.MP4 --resume
```

只想用已有中间结果重新生成最终 JSON，可运行同一 workflow 并加 `--assemble-only`；它不会请求模型：

```bash
python3 -m coffeegame.workflow --input source/冰美式第一人称视频.MP4 --assemble-only
```

## 单独运行步骤

```bash
python3 -m coffeegame.steps.compress_video --input source/冰美式第一人称视频.MP4 --output test/coffee_compressed.mp4
python3 -m coffeegame.steps.extract_audio --input test/coffee_compressed.mp4 --output test/coffee_audio.wav
python3 -m coffeegame.steps.analyze_audio --audio test/coffee_audio.wav --prompt-file coffeegame/prompts/speech_timeline_v1.txt --output test/coffee_transcript.json
python3 -m coffeegame.steps.extract_frames --input test/coffee_compressed.mp4 --output-dir test/coffee_frames
python3 -m coffeegame.steps.analyze_frames_gpt --frames-manifest test/coffee_frames/manifest.json --transcript test/coffee_transcript.json --output test/coffee_analysis.json
python3 -m coffeegame.steps.assemble_timeline --video-analysis test/coffee_analysis.json --transcript test/coffee_transcript.json --analysis-video test/coffee_compressed.mp4 --source-video source/冰美式第一人称视频.MP4 --output test/coffee_final.json
python3 -m coffeegame.steps.clip_video --input test/coffee_compressed.mp4 --start 0 --duration 60 --output test/coffee_first_minute.mp4
```

默认动作提示词在 [coffeegame/prompts/video_timeline_v3.txt](../coffeegame/prompts/video_timeline_v3.txt)：动作必须有画面依据，相关原声转写写入 `audio_context`，不以讲解代替画面事实。每个 `segment` 包含时间、场景、动作、交互物品、画面依据、声音线索及到下一动作的过渡；`transition_windows` 只放真正可见的停顿候选。逐句转写提示词在 [coffeegame/prompts/speech_timeline_v1.txt](../coffeegame/prompts/speech_timeline_v1.txt)。最终合并把每句话按最大时间交集放入一个动作段；跨段的语句在 `also_overlaps` 标记其他重叠段。这是时间整理，语义关系及剪辑边界仍需人工核对。

Gemini 转写默认发送 `responseJsonSchema`；GPT 动作分析使用严格 JSON Schema。模型原文保存为 `.raw.txt`，解析结果保存为 `.json`；`--save-api-response` 额外保存接口响应 `.api.json`。若实际返回模型与请求模型不同，会在 `.warnings.txt` 中说明。GPT 分段响应保存在 `gpt_chunks/`。

如果模型已返回、仅本地 JSON 整理或合并失败，`analyze_audio --response-file <已有的 transcript.api.json>` 可离线重处理原响应，随后用 `workflow --assemble-only` 重做最终合并；无需重新上传视频或音频。

旧的 Gemini 视频分析脚本仍可单独使用，但不再由默认 workflow 调用。引力 VIP 曾把 `gemini-3.8-flash` 视频请求转到 `3.1-flash-lite-05-2026`。冰美式原片的全片分析可参见[视频时间线复核](video-review-2026-11-20.md)。

## 单独分析声音

```bash
python3 -m coffeegame.steps.extract_audio --input test/coffee_compressed.mp4 --start 240 --duration 30 --output test/audio_240_270.wav
python3 -m coffeegame.steps.analyze_audio --audio test/audio_240_270.wav --output test/audio_240_270_events.json
```

第一步只抽取 16 kHz 单声道 WAV，并写 `.source.json` 记录原视频和起点；第二步只把音频发给模型。此处默认用 [coffeegame/prompts/audio_events_v1.txt](../coffeegame/prompts/audio_events_v1.txt) 分析语音、环境声和音乐；主工作流改用逐句转写提示词。`start_seconds`、`end_seconds` 已换算为原视频时间。音频输入上限 60 MiB；实际返回模型可能与请求不同，见 `.warnings.txt`。

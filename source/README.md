# 本地原始素材

冰美式教学原片在 `冰美式第一人称视频.MP4`，由 Git LFS 管理。它约 10 分钟，约 724 MiB，竖屏显示尺寸为 1728 × 3072，编码为 HEVC。

互动短剧默认播放 `demo/media/story-full.mp4`，这是同一条原片的 H.264/AAC 竖屏版。课程从 00:07.5 开始播放，关卡和字幕沿用原片时间。`/media/story-original.mp4` 可以访问 HEVC 原片。[动作时间索引](../docs/video-timeline.json) · [中文字幕](../demo/captions/story-zh.vtt)

换机器或重新克隆仓库后，安装 Git LFS，再在项目根目录运行 `git lfs install --local` 和 `git lfs pull`。如果 MP4 只有一百多字节，看到的是 LFS 指针，需要拉取视频数据。若原片另存，可用 `python3 demo/serve.py --source "/原片的绝对路径.MP4"` 指定同一条视频。使用其他剪辑版本会导致暂停点与字幕错位。

`demo/media/` 保存封面和练习片段，其中 MP4 也由 Git LFS 管理。`test/` 保存本地分析副本与中间结果，由 Git 忽略。接手者可直接使用仓库里的动作索引与字幕定位素材。

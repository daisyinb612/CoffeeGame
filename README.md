# CoffeeGame · 冰美式制作互动教学

**[打开 Demo（本机预览）](http://127.0.0.1:8765/)**

用手机竖屏观看第一人称教学视频。41 个关卡直接叠在原片画面上，答对继续播放，答错可以看提示并重试。第一关跟着老师认器具，后面还有滑动搅拌。原声默认静音，中文字幕默认显示。

## 本地启动

预览链接在运行服务的设备上打开。第一次使用时，按[素材说明](source/README.md)放入原片，再在项目根目录运行：

```sh
python3 demo/build_media.py --story
python3 demo/serve.py
```

生成封面需要 FFmpeg。之后可直接运行 `python3 demo/serve.py`。视频使用本地 HEVC 原片。

[Demo 说明](demo/README.md) · [项目文档](docs/README.md) · [视频理解工作流](docs/video-workflow.md)

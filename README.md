# CoffeeGame V1 · 冰美式制作互动教学

## 快速启动

先安装 Git LFS 和 Python 3，使用支持 HEVC 的浏览器。第一次在电脑上打开 V1，复制以下命令：

```sh
git clone --branch codex/interactive-coffee-demo https://github.com/daisyinb612/CoffeeGame.git
cd CoffeeGame
git lfs install --local
git lfs pull
python3 demo/serve.py
```

服务启动后，打开 [本机短剧](http://127.0.0.1:8765/)。已克隆并下载素材时，在仓库根目录运行 `python3 demo/serve.py` 即可。终端按 Ctrl+C 停止服务。

原片位于 `source/冰美式第一人称视频.MP4`，约 724 MiB。若文件只有一百多字节，请重新运行 `git lfs pull`。如果 8765 端口已被占用，可运行 `python3 demo/serve.py --port 8766`，再访问 [备用本机端口](http://127.0.0.1:8766/)。

## V1 内容

V1 是首个可玩的版本。手机竖屏播放第一人称原片，按视频顺序暂停做 19 个互动关卡，答完从暂停处继续。原声默认静音，中文字幕默认显示。右上角「设置 → 关卡选择」可以跳到指定关卡。

| 关卡 | 内容 |
| --- | --- |
| 1–4 | 准备及个人卫生 |
| 5 | 冰杯预处理 |
| 6–10 | 手柄处理 |
| 11–13 | 咖啡机萃取 |
| 14 | 调配与搅拌 |
| 15–16 | 成品与摆盘出品、出品服务表达 |
| 17–19 | 清洁器具、清洁工作台面、工具归位 |

V1 以练习和过关为主。阶段评分表满分 20 分，当前尚未实现完整的阶段计分和总分汇总。已有的备料、撒漏和归位检查按 V1 的现有范围运行。

## 素材和代码去哪找

| 要找什么 | 入口 |
| --- | --- |
| 原片、练习视频和 Git LFS 下载方式 | [素材说明](source/README.md) |
| 原声字幕与每个动作在原片的时间 | [中文字幕](demo/captions/story-zh.vtt)、[动作时间索引](docs/video-timeline.json)、[原片复核](docs/video-review-2026-11-20.md) |
| 关卡编号、暂停时间、题目和玩法 | [关卡配置](demo/story.js)、[短剧控制器](demo/drama.js)、[玩法代码索引](demo/README.md#调整课程) |
| 图片、练习图、3D 依赖 | [demo/assets/](demo/assets/)、[demo/vendor/](demo/vendor/) |
| 拍摄清单、关卡草案、早期设计和分析流程 | [文档索引](docs/README.md) |

接手时先看 `demo/story.js`，用关卡的 `at` 定位原片秒数，用 `ref` 对照动作索引，再按 `game` 找到玩法代码。短剧首页是 `demo/index.html`，旧分步练习的入口是 `demo/practice.html`。

原片和 `demo/media/` 里的 MP4 由 Git LFS 管理。封面、配图、音效、字幕、3D 依赖和参考文档随仓库保存。`test/` 下的本地分析中间文件由 Git 忽略。

"""GPT 分析步骤使用的 OpenAI 兼容接口配置。"""

import json
import os
import http.client
import time
import urllib.error
import urllib.request

from coffeegame import PROJECT_ROOT
from coffeegame.core.gemini_api import ConnectionFailure, request_json
from coffeegame.core.logging_utils import log_event


CONFIG = PROJECT_ROOT / "config.gpt.local.json"
DEFAULT_MODEL = "gpt-6.2-sol"


def check_openai_connection(url, timeout=8):
    """正式入口在处理视频前检查 TLS 通路；401 表示已连到服务端。"""
    if url.rstrip("/") != "https://api.openai.com/v1":
        return
    try:
        with urllib.request.urlopen(f"{url}/models", timeout=timeout):
            return
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return
        raise RuntimeError(f"GPT 接口连通检查收到 HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(
            f"无法连接 api.openai.com；请先检查代理线路，恢复后用 --resume 续跑：{exc}"
        ) from exc


def load_gpt_config():
    """优先读项目私有配置，其次读环境变量；不输出 API key。"""
    config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.is_file() else {}
    key = config.get("key") or os.getenv("OPENAI_API_KEY")
    url = config.get("url") or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = config.get("model") or os.getenv("COFFEEGAME_GPT_MODEL", DEFAULT_MODEL)
    if not isinstance(key, str) or not key.strip():
        raise ValueError("缺少 GPT API key；请填写 config.gpt.local.json 或 OPENAI_API_KEY")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise ValueError("GPT 接口地址必须是 https URL")
    if not isinstance(model, str) or not model.strip():
        raise ValueError("GPT 模型名不能为空")
    return key.strip(), url.rstrip("/"), model.strip()


def chat_completion(url, key, payload, timeout=None):
    """调用 Chat Completions；遇连接被对端关闭时最多重试两次。"""
    for attempt in range(1, 4):
        try:
            return request_json(f"{url}/chat/completions", key, payload, timeout=timeout)
        except (ConnectionFailure, http.client.RemoteDisconnected,
                ConnectionResetError, BrokenPipeError) as exc:
            if attempt == 3:
                raise RuntimeError(f"GPT 连接连续中断 3 次：{exc}") from exc
            log_event(f"GPT 连接中断，将重试第 {attempt + 1} 次：{exc}", "WARN")
            time.sleep(attempt * 2)

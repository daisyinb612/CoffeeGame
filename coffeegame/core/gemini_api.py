"""供 Gemini 工具脚本共用的本地配置和 HTTP 请求代码。"""

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from coffeegame import PROJECT_ROOT
from coffeegame.core.logging_utils import log_event

CONFIG = PROJECT_ROOT / "config.local.json"
DEFAULT_MODEL = "gemini-3.8-flash"


class ConnectionFailure(RuntimeError):
    """HTTP 请求未建立连接或连接中断，可由调用方选择重试。"""


def load_config():
    """读取中转站配置，返回 token、地址和选定模型。"""
    if not CONFIG.exists():
        raise ValueError("缺少 config.local.json；请复制 config.local.json.example 并填写 key。")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config.get("_type") != "newapi_channel_conn":
        raise ValueError("config.local.json 的 _type 应为 newapi_channel_conn。")
    key = config.get("key", "").strip()
    if not key.startswith("sk-"):
        raise ValueError("请在 config.local.json 的 key 中填写引力VIP token。")
    url = config.get("url", "").strip().rstrip("/")
    if not url.startswith("https://"):
        raise ValueError("url 必须是 https 地址。")
    model = config.get("model")
    if model is not None and (not isinstance(model, str) or not model.strip()):
        raise ValueError("config.local.json 的 model 必须是非空模型名；也可以不填，运行时用 --model 指定")
    return key, url, model.strip() if model else DEFAULT_MODEL


def request_json(url, key, payload=None, timeout=180):
    """发送带 token 的 GET 或 JSON POST 请求；timeout=None 时不设置客户端超时。"""
    serialize_started = time.perf_counter()
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    if data is not None:
        log_event(f"请求体序列化完成：{len(data) / 1024**2:.1f} MiB，耗时 {time.perf_counter() - serialize_started:.2f} 秒")
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    parsed_url = urllib.parse.urlsplit(url)
    log_event(f"HTTP {req.get_method()} 开始：{parsed_url.netloc}{parsed_url.path}；客户端超时："
              f"{'不设置' if timeout is None else str(timeout) + ' 秒'}")
    started = time.perf_counter()
    try:
        with (urllib.request.urlopen(req) if timeout is None
              else urllib.request.urlopen(req, timeout=timeout)) as response:
            log_event(f"HTTP {response.status} 收到响应头，耗时 {time.perf_counter() - started:.2f} 秒")
            result = json.load(response)
            log_event(f"响应 JSON 读取完成，总耗时 {time.perf_counter() - started:.2f} 秒")
            return result
    except urllib.error.HTTPError as exc:
        log_event(f"HTTP {exc.code} 请求失败，耗时 {time.perf_counter() - started:.2f} 秒", "ERROR")
        body = exc.read(1200).decode("utf-8", errors="replace")
        raise RuntimeError(f"接口返回 HTTP {exc.code}: {body}") from None
    except (TimeoutError, socket.timeout):
        log_event(f"HTTP 请求超时，耗时 {time.perf_counter() - started:.2f} 秒", "ERROR")
        detail = ("请求发生超时；该请求未得到确认结果" if timeout is None else
                  f"接口等待超过 {timeout:g} 秒；该请求未得到确认结果")
        raise RuntimeError(detail) from None
    except urllib.error.URLError as exc:
        log_event(f"HTTP 连接失败，耗时 {time.perf_counter() - started:.2f} 秒", "ERROR")
        raise ConnectionFailure(f"接口连接失败：{exc.reason}") from exc

"""命令行步骤共用的时间日志格式。"""

from datetime import datetime


def format_event(message, level="INFO"):
    """给一条日志加本地时间和级别，不记录凭据或请求正文。"""
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    return f"[{timestamp}] [{level}] {message}"


def log_event(message, level="INFO"):
    """立即打印日志，长请求期间也能看到最新进度。"""
    print(format_event(message, level), flush=True)

"""视频和音频分析共用的 JSON 与时间戳整理。"""

import json
import re


def parse_model_json(answer):
    """解析模型 JSON；保留字符串内未转义的控制字符并提示复核。"""
    try:
        return json.loads(answer), None
    except json.JSONDecodeError as original_error:
        try:
            return json.loads(answer, strict=False), "模型原文含未转义控制字符；已保留文本并重新编码为有效 JSON，需复核。"
        except json.JSONDecodeError:
            raise original_error from None


def normalize_json_keys(value, path="$"):
    """仅移除模型插入字段名的控制字符，不改正文内容。"""
    warnings = []
    if isinstance(value, list):
        items = []
        for index, item in enumerate(value):
            normalized, item_warnings = normalize_json_keys(item, f"{path}[{index}]")
            items.append(normalized)
            warnings.extend(item_warnings)
        return items, warnings
    if not isinstance(value, dict):
        return value, warnings
    result = {}
    for key, item in value.items():
        normalized_key = re.sub(r"[\x00-\x1f]", "", key)
        if normalized_key != key:
            warnings.append(f"{path} 字段名 {key!r} 含控制字符，已恢复为 {normalized_key!r}")
        if normalized_key in result:
            raise ValueError(f"{path} 字段名修复后出现重复：{normalized_key!r}")
        normalized, item_warnings = normalize_json_keys(item, f"{path}.{normalized_key}")
        result[normalized_key] = normalized
        warnings.extend(item_warnings)
    return result, warnings


def media_timestamp(seconds):
    """将媒体时长写为 MM:SS 或 HH:MM:SS。"""
    total = round(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, remaining_seconds = divmod(remainder, 60)
    return (f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}" if hours
            else f"{minutes:02d}:{remaining_seconds:02d}")


def timestamp_seconds(value):
    """仅换算含冒号的时间戳，拒绝 955 一类有歧义的数字。"""
    if not isinstance(value, str):
        raise ValueError(f"时间戳不是字符串：{value!r}")
    parts = value.strip().split(":")
    if len(parts) not in (2, 3) or not all(re.fullmatch(r"\d+", part) for part in parts[:-1]):
        raise ValueError(f"时间戳格式无效：{value!r}")
    if not re.fullmatch(r"\d{1,2}(?:\.\d+)?", parts[-1]):
        raise ValueError(f"时间戳秒数无效：{value!r}")
    seconds = float(parts[-1])
    minutes = int(parts[-2])
    if seconds >= 60 or (len(parts) == 3 and minutes >= 60):
        raise ValueError(f"时间戳超出进制范围：{value!r}")
    total = minutes * 60 + seconds
    if len(parts) == 3:
        total += int(parts[0]) * 3600
    return int(total) if total.is_integer() else total


def normalize_timestamps(data, collections):
    """将指定数组里的 MM:SS 换算为秒；只修复时间戳中的空白。"""
    warnings = []
    if not isinstance(data, dict):
        return warnings
    for collection in collections:
        items = data.get(collection)
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict) or "start_time" not in item or "end_time" not in item:
                continue
            for field in ("start_time", "end_time"):
                original = item[field]
                if isinstance(original, str):
                    cleaned = re.sub(r"\s+", "", original)
                    if cleaned != original:
                        warnings.append(f"{collection} 第 {index} 项 {field} 含空白，已从 {original!r} 修复为 {cleaned!r}")
                        item[field] = cleaned
            try:
                start = timestamp_seconds(item["start_time"])
                end = timestamp_seconds(item["end_time"])
            except ValueError as exc:
                warnings.append(f"{collection} 第 {index} 项时间戳未换算：{exc}")
                continue
            item["start_seconds"] = start
            item["end_seconds"] = end
            del item["start_time"]
            del item["end_time"]
    return warnings

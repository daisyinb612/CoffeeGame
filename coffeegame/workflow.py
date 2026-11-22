#!/usr/bin/env python3
"""转写原声后，用 GPT 分析采样画面与逐句台词，生成合并时间线。"""

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.gemini_api import load_config
from coffeegame.core.logging_utils import format_event
from coffeegame.core.openai_api import check_openai_connection, load_gpt_config


ROOT = PROJECT_ROOT


def read_json_if_present(path):
    """恢复执行时读取已有索引；缺失或损坏则重做该步骤。"""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def emit(message, log_stream=None, level="INFO"):
    """同时打印并保存一条工作流日志。"""
    line = format_event(message, level)
    print(line, flush=True)
    if log_stream is not None:
        log_stream.write(line + "\n")
        log_stream.flush()


def run_stage(module, log_stream, *arguments):
    """实时转发步骤日志，记录退出码和耗时；失败时停止工作流。"""
    command = [sys.executable, "-u", "-m", module, *map(str, arguments)]
    emit(f"开始步骤：{module}", log_stream)
    started = time.perf_counter()
    with subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True, bufsize=1) as process:
        for line in process.stdout:
            print(line, end="", flush=True)
            log_stream.write(line)
            log_stream.flush()
        return_code = process.wait()
    elapsed = time.perf_counter() - started
    emit(f"结束步骤：{module}；退出码 {return_code}；耗时 {elapsed:.2f} 秒",
         log_stream, "ERROR" if return_code else "INFO")
    if return_code:
        raise RuntimeError(f"{module} 失败，工作流已停止")


def main():
    """对任意 ffmpeg 可读取的视频执行独立且可复跑的音画步骤。"""
    parser = argparse.ArgumentParser(description="压缩 → 抽取音轨 → 逐句转写 → 抽帧 → GPT 理解 → 合并 JSON")
    parser.add_argument("--input", type=Path, required=True, help="原始视频路径")
    parser.add_argument("--work-dir", type=Path, help="中间文件目录；默认 test/workflow/<视频名>-<路径指纹>")
    parser.add_argument("--output", type=Path, help="最终合并 JSON；默认 <work-dir>/final.json")
    parser.add_argument("--analysis-output", type=Path, help="中间音画理解 JSON；默认 <work-dir>/analysis.json")
    parser.add_argument("--transcript-output", type=Path, help="逐句转写 JSON；默认 <work-dir>/transcript.json")
    parser.add_argument("--assemble-only", action="store_true",
                        help="复用现有的压缩视频与两份分析结果，只重做最终合并")
    parser.add_argument("--resume", action="store_true",
                        help="复用本工作目录已完成的压缩、转写、抽帧和 GPT 片段")
    parser.add_argument("--model", help="GPT 画面分析模型；默认 gpt-6.2-sol")
    parser.add_argument("--audio-model", help="逐句转写模型；默认 gemini-3.8-flash")
    parser.add_argument("--frame-fps", type=float, default=1.0, help="GPT 分析用抽帧率；默认每秒 1 帧")
    parser.add_argument("--chunk-seconds", type=int, default=30, help="GPT 每次分析的片段秒数；默认 30")
    parser.add_argument("--prompt-file", type=Path, help="自定义 UTF-8 提示词文件")
    parser.add_argument("--speech-prompt-file", type=Path, help="自定义逐句转写提示词文件")
    parser.add_argument("--timeout", type=float, help="可选客户端超时；默认不设置")
    args = parser.parse_args()
    started = time.perf_counter()
    log_stream = None
    try:
        source = args.input.resolve()
        if not source.is_file():
            raise ValueError(f"请选择存在的视频文件：{source}")
        if args.timeout is not None and args.timeout <= 0:
            raise ValueError("timeout 必须大于 0")
        if not 0 < args.frame_fps <= 4:
            raise ValueError("frame-fps 必须在 0 到 4 之间")
        if not 10 <= args.chunk_seconds <= 120:
            raise ValueError("chunk-seconds 必须在 10 到 120 秒之间")
        for prompt_file in (args.prompt_file, args.speech_prompt_file):
            if prompt_file is not None and not prompt_file.is_file():
                raise ValueError(f"提示词文件不存在：{prompt_file}")
        source_id = hashlib.sha256(str(source).encode("utf-8")).hexdigest()[:8]
        work_dir = (args.work_dir or ROOT / "test" / "workflow" / f"{source.stem}-{source_id}").resolve()
        work_dir.mkdir(parents=True, exist_ok=True)
        log_path = work_dir / "workflow.log"
        log_stream = log_path.open("a", encoding="utf-8")
        emit(f"工作流开始：输入 {source}；日志 {log_path}", log_stream)
        compressed = work_dir / "compressed.mp4"
        frames_dir = work_dir / "frames"
        analysis = args.analysis_output.resolve() if args.analysis_output else work_dir / "analysis.json"
        audio = work_dir / "audio.wav"
        transcript = args.transcript_output.resolve() if args.transcript_output else work_dir / "transcript.json"
        output = args.output.resolve() if args.output else work_dir / "final.json"

        if args.assemble_only:
            emit("复用已有压缩视频、音画分析和逐句转写；跳过模型请求", log_stream)
            for path in (compressed, analysis, transcript):
                if not path.is_file():
                    raise ValueError(f"合并所需文件不存在：{path}")
        else:
            _, _, configured_model = load_config()
            _, gpt_url, configured_gpt_model = load_gpt_config()
            audio_model = args.audio_model or configured_model
            gpt_model = args.model or configured_gpt_model
            emit(f"GPT 画面模型：{gpt_model}；逐句转写模型：{audio_model}", log_stream)
            if not args.resume:
                emit("检查 GPT 接口连通性", log_stream)
                check_openai_connection(gpt_url)
            emit("步骤 1/6：压缩视频", log_stream)
            reuse_compressed = (args.resume and compressed.is_file()
                                and compressed.stat().st_mtime >= source.stat().st_mtime)
            if reuse_compressed:
                emit(f"复用压缩视频：{compressed}", log_stream)
            else:
                run_stage("coffeegame.steps.compress_video", log_stream,
                          "--input", source, "--output", compressed)
            emit("步骤 2/6：抽取音轨", log_stream)
            audio_source = read_json_if_present(audio.with_suffix(".source.json"))
            reuse_audio = (reuse_compressed and audio.is_file()
                           and audio.stat().st_mtime >= compressed.stat().st_mtime
                           and audio_source.get("source_file") == str(compressed))
            if reuse_audio:
                emit(f"复用音轨：{audio}", log_stream)
            else:
                run_stage("coffeegame.steps.extract_audio", log_stream,
                          "--input", compressed, "--output", audio)
            emit("步骤 3/6：逐句转写原声", log_stream)
            speech_prompt = (args.speech_prompt_file.resolve() if args.speech_prompt_file else
                             ROOT / "coffeegame" / "prompts" / "speech_timeline_v1.txt")
            audio_arguments = ["--audio", audio, "--output", transcript, "--model", audio_model,
                               "--prompt-file", speech_prompt, "--save-api-response"]
            if args.timeout is not None:
                audio_arguments += ["--timeout", args.timeout]
            reuse_transcript = (reuse_audio and transcript.is_file()
                                and transcript.stat().st_mtime >= audio.stat().st_mtime)
            if reuse_transcript:
                emit(f"复用逐句转写：{transcript}", log_stream)
            else:
                run_stage("coffeegame.steps.analyze_audio", log_stream, *audio_arguments)
            emit("步骤 4/6：按时间抽取视频帧", log_stream)
            frame_manifest = frames_dir / "manifest.json"
            frame_info = read_json_if_present(frame_manifest)
            reuse_frames = (reuse_compressed and frame_manifest.is_file()
                            and frame_manifest.stat().st_mtime >= compressed.stat().st_mtime
                            and frame_info.get("source_video") == str(compressed)
                            and frame_info.get("fps") == args.frame_fps)
            if reuse_frames:
                emit(f"复用视频帧：{frames_dir / 'manifest.json'}", log_stream)
            else:
                run_stage("coffeegame.steps.extract_frames", log_stream,
                          "--input", compressed, "--output-dir", frames_dir,
                          "--fps", args.frame_fps)
            emit("步骤 5/6：GPT 理解画面与逐句转写", log_stream)
            gpt_arguments = ["--frames-manifest", frames_dir / "manifest.json",
                             "--transcript", transcript, "--output", analysis,
                             "--model", gpt_model, "--chunk-seconds", args.chunk_seconds,
                             "--save-api-response"]
            if args.resume:
                gpt_arguments += ["--resume"]
            if args.prompt_file:
                gpt_arguments += ["--prompt-file", args.prompt_file.resolve()]
            if args.timeout is not None:
                gpt_arguments += ["--timeout", args.timeout]
            run_stage("coffeegame.steps.analyze_frames_gpt", log_stream, *gpt_arguments)
        emit("步骤 6/6：合并动作与逐句原话", log_stream)
        run_stage("coffeegame.steps.assemble_timeline", log_stream,
                  "--video-analysis", analysis, "--transcript", transcript,
                  "--analysis-video", compressed, "--source-video", source,
                  "--output", output)
        emit(f"工作流完成：最终结果 {output}；中间结果 {analysis}、{transcript}；"
             f"总耗时 {time.perf_counter() - started:.2f} 秒", log_stream)
    except (OSError, ValueError, RuntimeError) as exc:
        emit(f"工作流失败：{exc}；总耗时 {time.perf_counter() - started:.2f} 秒", log_stream, "ERROR")
        return 1
    finally:
        if log_stream is not None:
            log_stream.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

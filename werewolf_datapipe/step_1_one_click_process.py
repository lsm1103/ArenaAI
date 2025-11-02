#!/usr/bin/env python3
"""
单视频处理脚本 - 支持自定义JSON配置文件格式
与step_9不同，此脚本接受简化的配置格式，包含参与人员、身份、版型和时间标记
"""

import os
import json
import argparse
import torch
import torchaudio
import numpy as np
from typing import List, Dict, Any, Optional
from scipy.spatial.distance import cosine
import tempfile
import soundfile as sf

# 默认配置
VOICEPRINT_PT = "./voiceprints.pt"
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_SIMILARITY_THRESHOLD = 0.3
DEFAULT_VAD_THRESHOLD = 0.5
DEFAULT_MIN_SPEECH_DURATION = 0.5
DEFAULT_MIN_SILENCE_DURATION = 0.8
DEFAULT_MIN_SPEAKER_DURATION = 3.0
DEFAULT_WINDOW_SIZE = 512


def parse_config_file(config_path: str) -> Dict[str, Any]:
    """解析配置文件

    配置文件格式:
    {
        "participants": [
            {"name": "张三", "role": "狼人", "seq": "一号"},
            {"name": "李四", "role": "村民", "seq": "二号"},
            ...
        ],
        "board_type": "标准局",
        "time_marks": [
            {"time": "1:30", "label": "第一晚"},
            {"time": "150", "label": "第一天发言"},  // 支持帧数
            {"time": "5:20", "label": "第二晚"},
            ...
        ]
    }
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 解析参与人员、角色和号位
    participants = config.get('participants', [])
    speaker_roles = {}
    speaker_seqs = {}
    seq_to_name = {}
    candidates = set()

    for p in participants:
        name = p.get('name')
        role = p.get('role', '未知角色')
        seq = p.get('seq', '')
        if name:
            speaker_roles[name] = role
            speaker_seqs[name] = seq
            if seq and seq != '无':
                seq_to_name[seq] = name
            candidates.add(name)

    # 添加法官
    if '法官' not in candidates:
        candidates.add('法官')
        speaker_roles['法官'] = '法官'
        speaker_seqs['法官'] = '无'

    # 解析时间标记
    time_marks = []
    for mark in config.get('time_marks', []):
        time_str = mark.get('time', '')
        label = mark.get('label', '')

        if not time_str or not label:
            continue

        # 解析时间: 支持 "分:秒" 或 帧数
        start_ms = parse_time_to_ms(time_str)
        if start_ms is not None:
            time_marks.append({
                'start_ms': start_ms,
                'label': label
            })

    time_marks.sort(key=lambda x: x['start_ms'])

    return {
        'name': config.get('name', '未命名比赛'),
        'speaker_roles': speaker_roles,
        'speaker_seqs': speaker_seqs,
        'seq_to_name': seq_to_name,
        'candidates': sorted(list(candidates)),
        'time_marks': time_marks,
        'board_type': config.get('board_type', '未知版型'),
        'no_sheriff': config.get('no_sheriff', [])
    }


def parse_time_to_ms(time_str: str, fps: float = 30.0) -> Optional[int]:
    """解析时间字符串为毫秒

    支持格式:
    - "分:秒" 例如 "1:30" -> 90000ms
    - "帧数" 例如 "150" -> 5000ms (假设30fps)
    """
    time_str = time_str.strip()

    # 尝试解析 "分:秒" 格式
    if ':' in time_str:
        try:
            parts = time_str.split(':')
            if len(parts) == 2:
                minutes = int(parts[0])
                seconds = int(parts[1])
                return (minutes * 60 + seconds) * 1000
            elif len(parts) == 3:  # 支持 "时:分:秒"
                hours = int(parts[0])
                minutes = int(parts[1])
                seconds = int(parts[2])
                return (hours * 3600 + minutes * 60 + seconds) * 1000
        except ValueError:
            pass

    # 尝试解析为帧数
    try:
        frames = float(time_str)
        return int(frames * 1000 / fps)
    except ValueError:
        pass

    return None


def init_silero_vad():
    """初始化Silero VAD模型"""
    try:
        silero_path = os.path.join(os.path.dirname(__file__), 'silero-vad')
        
        vad_model, utils = torch.hub.load(
            repo_or_dir=silero_path,
            model='silero_vad',
            source='local',
            force_reload=False,
            onnx=False,
            skip_validation=True
        )
        return vad_model, utils
    except Exception as e:
        raise RuntimeError(f"初始化Silero VAD失败: {e}")


def load_audio_for_vad(file_path: str, target_sample_rate: int = DEFAULT_SAMPLE_RATE) -> torch.Tensor:
    """加载音频文件并转换为VAD所需格式"""
    try:
        waveform, sample_rate = torchaudio.load(file_path)

        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        if sample_rate != target_sample_rate:
            resampler = torchaudio.transforms.Resample(sample_rate, target_sample_rate)
            waveform = resampler(waveform)

        waveform = waveform.squeeze()
        return waveform
    except Exception as e:
        raise RuntimeError(f"加载音频文件失败 {file_path}: {e}")


def segment_audio_with_vad(
    audio_tensor: torch.Tensor,
    vad_model,
    utils,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    threshold: float = DEFAULT_VAD_THRESHOLD,
    min_speech_duration: float = DEFAULT_MIN_SPEECH_DURATION,
    min_silence_duration: float = DEFAULT_MIN_SILENCE_DURATION,
    window_size: int = DEFAULT_WINDOW_SIZE
) -> List[Dict[str, Any]]:
    """使用Silero VAD对音频进行语音活动检测和分段"""
    try:
        get_speech_timestamps = utils[0]

        speech_timestamps = get_speech_timestamps(
            audio_tensor,
            vad_model,
            threshold=threshold,
            min_speech_duration_ms=int(min_speech_duration * 1000),
            min_silence_duration_ms=int(min_silence_duration * 1000),
            window_size_samples=window_size,
            speech_pad_ms=30
        )

        segments = []
        for i, timestamp in enumerate(speech_timestamps):
            start_sample = timestamp['start']
            end_sample = timestamp['end']

            start_ms = int(start_sample * 1000 / sample_rate)
            end_ms = int(end_sample * 1000 / sample_rate)

            segment_audio = audio_tensor[start_sample:end_sample]

            segments.append({
                'start_ms': start_ms,
                'end_ms': end_ms,
                'start_sample': start_sample,
                'end_sample': end_sample,
                'audio_segment': segment_audio,
                'duration_ms': end_ms - start_ms,
                'segment_id': i
            })

        return segments
    except Exception as e:
        raise RuntimeError(f"VAD分段失败: {e}")


def load_voiceprints() -> Dict[str, np.ndarray]:
    """加载声纹库"""
    if not os.path.exists(VOICEPRINT_PT):
        print(f"未找到声纹库: {VOICEPRINT_PT}")
        return {}

    try:
        data = torch.load(VOICEPRINT_PT, map_location='cpu')
        return {k: v.numpy() if isinstance(v, torch.Tensor) else v for k, v in data.items()}
    except Exception as e:
        print(f"加载声纹库失败: {e}")
        return {}


def filter_voiceprints_by_candidates(
    voiceprints: Dict[str, np.ndarray],
    candidates: List[str]
) -> Dict[str, np.ndarray]:
    """根据候选说话人列表过滤声纹库"""
    if not candidates:
        return voiceprints

    filtered = {}
    for speaker in candidates:
        if speaker in voiceprints:
            filtered[speaker] = voiceprints[speaker]
    filtered['法官'] = voiceprints['法官']
    print(f"声纹库过滤: {len(voiceprints)} -> {len(filtered)} (候选: {len(candidates)})")
    if len(filtered) < len(candidates):
        missing = set(candidates) - set(filtered.keys())
        print(f"缺少声纹的候选人: {sorted(missing)}")

    return filtered


def init_sv_pipeline():
    """初始化说话人验证管线"""
    try:
        from modelscope.pipelines import pipeline
        return pipeline(
            task='speaker-verification',
            model='iic/speech_campplus_sv_zh-cn_16k-common',
            model_revision='v1.0.0'
        )
    except Exception as e:
        raise RuntimeError(f"初始化说话人验证管线失败: {e}")


def extract_segment_embedding(sv_pipeline, wav_path: str) -> Optional[np.ndarray]:
    """提取单个音频片段的embedding"""
    from collections.abc import Sequence

    def normalize_embs(embs_obj) -> Optional[np.ndarray]:
        try:
            ndim = getattr(embs_obj, 'ndim', None)
            if ndim is not None:
                if ndim == 1:
                    vec = embs_obj
                elif ndim >= 2:
                    vec = embs_obj[0]
                else:
                    return None
                return vec.copy() if hasattr(vec, 'copy') else np.array(vec)

            if isinstance(embs_obj, Sequence) and not isinstance(embs_obj, (str, bytes)):
                if len(embs_obj) == 0:
                    return None
                first = embs_obj[0]
                if isinstance(first, Sequence) and not isinstance(first, (str, bytes)):
                    vec = first
                else:
                    vec = embs_obj

                if hasattr(vec, 'numpy'):
                    return vec.numpy()
                elif hasattr(vec, 'tolist'):
                    return np.array(vec.tolist())
                else:
                    return np.array(vec)
            return None
        except Exception:
            return None

    try:
        result = sv_pipeline([wav_path, wav_path], output_emb=True)
        embs = result.get('embs') if isinstance(result, dict) else None
        if embs is not None:
            return normalize_embs(embs)
    except Exception as e:
        print(f"提取embedding失败 {wav_path}: {e}")
    return None


def process_audio_segment_for_embedding(
    segment_audio: torch.Tensor,
    sv_pipeline,
    sample_rate: int = DEFAULT_SAMPLE_RATE
) -> Optional[np.ndarray]:
    """直接从音频张量计算embedding"""
    try:
        audio_np = segment_audio.numpy()

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            sf.write(tmp_file.name, audio_np, sample_rate)
            embedding = extract_segment_embedding(sv_pipeline, tmp_file.name)
            os.unlink(tmp_file.name)
            return embedding
    except Exception as e:
        print(f"处理音频段embedding失败: {e}")
        return None


def identify_speaker(
    segment_emb: np.ndarray,
    voiceprints: Dict[str, np.ndarray],
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD
) -> str:
    """通过embedding相似度识别说话人"""
    if len(voiceprints) == 0:
        return "未知"

    best_speaker = None
    best_similarity = -1

    for speaker, speaker_emb in voiceprints.items():
        try:
            similarity = 1 - cosine(segment_emb, speaker_emb)
            if similarity > best_similarity:
                best_similarity = similarity
                best_speaker = speaker
        except Exception as e:
            print(f"计算相似度失败 {speaker}: {e}")
            continue

    if best_similarity >= threshold:
        return best_speaker
    else:
        return "未知"


def init_asr_pipeline():
    """初始化并返回 Paraformer 推理管线"""
    try:
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks
        inference_pipeline = pipeline(
            task=Tasks.auto_speech_recognition,
            model='iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch',
            model_revision="v2.0.4"
        )
        return inference_pipeline
    except Exception as e:
        raise RuntimeError(f"初始化 Paraformer 失败: {e}")


def transcribe_paraformer(inference_pipeline, wav_path: str) -> str:
    """使用已初始化的 Paraformer 管线进行 ASR 识别"""
    try:
        result = inference_pipeline(wav_path)
        if isinstance(result, dict):
            return result.get('text', '')
        elif isinstance(result, str):
            return result
        elif isinstance(result, list) and result:
            first_item = result[0]
            if isinstance(first_item, dict):
                return first_item.get('text', '')
            elif isinstance(first_item, str):
                return first_item
        return ""
    except Exception as e:
        print(f"ASR识别失败 {wav_path}: {e}")
        return ""


def process_audio_segment_for_asr(
    segment_audio: torch.Tensor,
    asr_pipeline,
    sample_rate: int = DEFAULT_SAMPLE_RATE
) -> str:
    """直接从音频张量计算ASR结果"""
    try:
        audio_np = segment_audio.numpy()

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            sf.write(tmp_file.name, audio_np, sample_rate)
            text = transcribe_paraformer(asr_pipeline, tmp_file.name)
            os.unlink(tmp_file.name)
            return text
    except Exception as e:
        print(f"处理音频段ASR失败: {e}")
        return ""


def merge_consecutive_same_speaker(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """合并连续的同一说话人片段"""
    if not segments:
        return []

    merged = []
    current_speaker = None
    current_display_speaker = None
    current_start = None
    current_end = None
    current_texts = []

    for seg in segments:
        speaker = seg.get("speaker")
        display_speaker = seg.get("display_speaker", speaker)
        start_ms = seg.get("start_ms")
        end_ms = seg.get("end_ms")
        text = seg.get("text", "")

        if current_speaker is None:
            current_speaker = speaker
            current_display_speaker = display_speaker
            current_start = start_ms
            current_end = end_ms
            current_texts = [text] if text else []
        elif speaker == current_speaker:
            current_end = end_ms
            if text:
                current_texts.append(text)
        else:
            merged.append({
                "speaker": current_speaker,
                "display_speaker": current_display_speaker,
                "start_ms": current_start,
                "end_ms": current_end,
                "start": minsec(current_start),
                "end": minsec(current_end),
                "text": "".join(current_texts),
                "duration_ms": current_end - current_start
            })
            current_speaker = speaker
            current_display_speaker = display_speaker
            current_start = start_ms
            current_end = end_ms
            current_texts = [text] if text else []

    if current_speaker is not None:
        merged.append({
            "speaker": current_speaker,
            "display_speaker": current_display_speaker,
            "start_ms": current_start,
            "end_ms": current_end,
            "start": minsec(current_start),
            "end": minsec(current_end),
            "text": "".join(current_texts),
            "duration_ms": current_end - current_start
        })

    return merged


def filter_short_speaker_segments(
    merged_segments: List[Dict[str, Any]],
    min_duration_ms: float
) -> List[Dict[str, Any]]:
    """过滤并修正过短的说话人片段"""
    if not merged_segments or len(merged_segments) <= 1:
        return merged_segments

    min_duration_threshold = int(min_duration_ms * 1000)
    modified_segments = []

    for i, segment in enumerate(merged_segments):
        duration = segment.get('duration_ms', 0)
        speaker = segment.get('speaker')

        if duration < min_duration_threshold and speaker != "未知":
            prev_speaker = merged_segments[i-1].get('speaker') if i > 0 else None
            next_speaker = merged_segments[i+1].get('speaker') if i < len(merged_segments) - 1 else None

            if prev_speaker and prev_speaker == next_speaker:
                segment = segment.copy()
                segment['speaker'] = prev_speaker
                print(f"  过滤短片段: [{minsec(segment['start_ms'])}-{minsec(segment['end_ms'])}] "
                      f"原说话人 '{speaker}' -> 修正为 '{prev_speaker}' (时长: {duration/1000:.1f}秒)")
            elif prev_speaker:
                segment = segment.copy()
                original_speaker = speaker
                segment['speaker'] = prev_speaker
                print(f"  过滤短片段: [{minsec(segment['start_ms'])}-{minsec(segment['end_ms'])}] "
                      f"原说话人 '{original_speaker}' -> 修正为 '{prev_speaker}' (时长: {duration/1000:.1f}秒)")
            elif next_speaker:
                segment = segment.copy()
                original_speaker = speaker
                segment['speaker'] = next_speaker
                print(f"  过滤短片段: [{minsec(segment['start_ms'])}-{minsec(segment['end_ms'])}] "
                      f"原说话人 '{original_speaker}' -> 修正为 '{next_speaker}' (时长: {duration/1000:.1f}秒)")

        modified_segments.append(segment)

    if not modified_segments:
        return []

    final_merged = []
    current = modified_segments[0].copy()

    for i in range(1, len(modified_segments)):
        next_seg = modified_segments[i]

        if current['speaker'] == next_seg['speaker']:
            current['end_ms'] = next_seg['end_ms']
            current['end'] = minsec(next_seg['end_ms'])
            current['text'] += next_seg.get('text', '')
            current['duration_ms'] = current['end_ms'] - current['start_ms']
        else:
            final_merged.append(current)
            current = next_seg.copy()

    final_merged.append(current)
    return final_merged


def minsec(ms: int) -> str:
    """毫秒转分秒格式"""
    total = ms // 1000
    mm = total // 60
    ss = total % 60
    return f"{mm:02d}:{ss:02d}"


def process_video(
    bv_id: str,
    config: Dict[str, Any],
    audios_dir: str,
    vad_threshold: float = DEFAULT_VAD_THRESHOLD,
    min_speech_duration: float = DEFAULT_MIN_SPEECH_DURATION,
    min_silence_duration: float = DEFAULT_MIN_SILENCE_DURATION,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    min_speaker_duration: float = DEFAULT_MIN_SPEAKER_DURATION
):
    """处理单个视频"""

    mp3_path = os.path.join(audios_dir, f"{bv_id}.mp3")

    if not os.path.exists(mp3_path):
        raise FileNotFoundError(f"音频文件不存在: {mp3_path}")

    print(f"\n处理视频: {bv_id}")
    print(f"比赛名称: {config.get('name', '未命名')}")
    print(f"音频文件: {mp3_path}")
    print(f"版型: {config['board_type']}")
    print(f"参与人员: {config['candidates']}")
    print(f"时间标记: {len(config['time_marks'])} 个")

    # 获取号位映射
    speaker_seqs = config.get('speaker_seqs', {})

    # 加载声纹库
    all_voiceprints = load_voiceprints()
    if not all_voiceprints:
        raise RuntimeError("声纹库为空，请先运行 step_8")

    # 根据候选说话人过滤声纹库
    voiceprints = filter_voiceprints_by_candidates(all_voiceprints, config['candidates'])
    if not voiceprints:
        print(f"候选说话人都没有对应声纹，使用全部声纹库")
        voiceprints = all_voiceprints

    print(f"使用 {len(voiceprints)} 个说话人声纹: {list(voiceprints.keys())}")

    # 初始化模型
    print("\n正在初始化模型...")
    vad_model, vad_utils = init_silero_vad()
    sv_pipeline = init_sv_pipeline()
    asr_pipeline = init_asr_pipeline()
    print("模型初始化完成！")

    # 加载音频
    print("\n加载音频...")
    audio_tensor = load_audio_for_vad(mp3_path)

    # VAD分段
    print("正在进行VAD分段...")
    segments = segment_audio_with_vad(
        audio_tensor, vad_model, vad_utils,
        threshold=vad_threshold,
        min_speech_duration=min_speech_duration,
        min_silence_duration=min_silence_duration
    )
    print(f"检测到 {len(segments)} 个语音片段")

    # 处理每个片段
    print("\n处理语音片段...")
    processed_segments = []
    for i, segment in enumerate(segments):
        if (i + 1) % 10 == 0:
            print(f"处理进度: {i+1}/{len(segments)}")

        # 提取embedding
        embedding = process_audio_segment_for_embedding(segment['audio_segment'], sv_pipeline)

        # 识别说话人
        if embedding is not None:
            speaker = identify_speaker(embedding, voiceprints, similarity_threshold)
        else:
            speaker = "未知"

        # ASR识别
        text = process_audio_segment_for_asr(segment['audio_segment'], asr_pipeline)

        # 转换为号位显示（法官除外）
        display_speaker = speaker
        if speaker != "未知" and speaker != "法官" and speaker in speaker_seqs:
            seq = speaker_seqs[speaker]
            if seq and seq != '无':
                display_speaker = seq

        processed_segments.append({
            'start_ms': segment['start_ms'],
            'end_ms': segment['end_ms'],
            'duration_ms': segment['duration_ms'],
            'speaker': speaker,
            'display_speaker': display_speaker,
            'text': text
        })

    # 合并连续的同一说话人片段
    print("\n合并连续说话人片段...")
    merged_segments = merge_consecutive_same_speaker(processed_segments)
    print(f"合并后共 {len(merged_segments)} 个说话人片段")

    # 过滤过短的错误说话人片段
    if min_speaker_duration > 0:
        print(f"正在过滤短于 {min_speaker_duration}秒 的说话人片段...")
        filtered_segments = filter_short_speaker_segments(merged_segments, min_speaker_duration)
        print(f"过滤后共 {len(filtered_segments)} 个说话人片段")
    else:
        filtered_segments = merged_segments

    # 保存结果
    total_duration_ms = int(len(audio_tensor) * 1000 / DEFAULT_SAMPLE_RATE)

    json_output = {
        "match_name": config.get('name', '未命名比赛'),
        "video_name": bv_id,
        "mp3_path": mp3_path,
        "board_type": config['board_type'],
        "processing_config": {
            "vad_threshold": vad_threshold,
            "min_speech_duration": min_speech_duration,
            "min_silence_duration": min_silence_duration,
            "similarity_threshold": similarity_threshold,
            "min_speaker_duration": min_speaker_duration
        },
        "candidate_speakers": config['candidates'],
        "used_voiceprints": list(voiceprints.keys()),
        "segments": processed_segments,
        "merged_segments": filtered_segments,
        "time_marks": config['time_marks'],
        "speaker_roles": config['speaker_roles'],
        "speaker_seqs": config['speaker_seqs'],
        "no_sheriff": config.get('no_sheriff', []),
        "total_segments": len(segments),
        "total_duration_ms": total_duration_ms
    }

    out_json = os.path.join(audios_dir, f"{bv_id}_asr_voiceprint.json")
    out_txt = os.path.join(audios_dir, f"{bv_id}_asr_voiceprint.txt")

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(json_output, f, ensure_ascii=False, indent=2)

    # 创建可读的文本输出
    with open(out_txt, "w", encoding="utf-8") as f:
        f.write(f"=== {bv_id} 说话人日志 ===\n")
        f.write(f"比赛名称: {config.get('name', '未命名比赛')}\n")
        f.write(f"版型: {config['board_type']}\n")
        f.write(f"总时长: {minsec(total_duration_ms)}\n")
        f.write(f"语音片段: {len(segments)} 个\n")
        f.write(f"合并后片段: {len(filtered_segments)} 个\n")
        f.write(f"时间标记: {len(config['time_marks'])} 个\n")

        # 显示未上警玩家
        no_sheriff = config.get('no_sheriff', [])
        if no_sheriff:
            f.write(f"未上警玩家: {', '.join(no_sheriff)}\n")
        f.write("\n")

        f.write("=== 说话人身份信息 ===\n")
        sorted_speakers = sorted(config['speaker_roles'].keys())
        for speaker in sorted_speakers:
            role = config['speaker_roles'].get(speaker, "未知角色")
            seq = config['speaker_seqs'].get(speaker, '')
            if seq and seq != '无':
                f.write(f"{seq} ({speaker}): {role}\n")
            else:
                f.write(f"{speaker}: {role}\n")
        f.write("\n")

        # 创建合并的时间线
        all_items = []

        for segment in filtered_segments:
            all_items.append({
                "start_ms": segment['start_ms'],
                "type": "speech",
                "data": segment
            })

        for mark in config['time_marks']:
            all_items.append({
                "start_ms": mark['start_ms'],
                "type": "time_mark",
                "data": mark
            })

        all_items.sort(key=lambda x: x["start_ms"])

        for item in all_items:
            if item["type"] == "speech":
                segment = item["data"]
                display_speaker = segment.get('display_speaker', segment['speaker'])
                f.write(f"[{segment['start']}-{segment['end']}] {display_speaker}: {segment['text']}\n")
            elif item["type"] == "time_mark":
                mark = item["data"]
                start_time = minsec(mark["start_ms"])
                f.write(f"=== [{start_time}] {mark['label']} ===\n")

    print(f"\n完成: {out_txt}")
    print(f"完成: {out_json}")


def main():
    parser = argparse.ArgumentParser(description='单视频处理脚本')
    parser.add_argument('--bv-id', required=True, help='BV号')
    parser.add_argument('--config', required=True, help='配置文件路径')
    parser.add_argument('--audios-dir', required=True, help='音频目录')
    parser.add_argument('--vad-threshold', type=float, default=DEFAULT_VAD_THRESHOLD, help='VAD阈值')
    parser.add_argument('--min-speech-duration', type=float, default=DEFAULT_MIN_SPEECH_DURATION, help='最小语音片段长度(秒)')
    parser.add_argument('--min-silence-duration', type=float, default=DEFAULT_MIN_SILENCE_DURATION, help='最小静音片段长度(秒)')
    parser.add_argument('--similarity-threshold', type=float, default=DEFAULT_SIMILARITY_THRESHOLD, help='说话人相似度阈值')
    parser.add_argument('--min-speaker-duration', type=float, default=DEFAULT_MIN_SPEAKER_DURATION, help='最小说话人片段长度(秒)')

    args = parser.parse_args()

    print("=== 单视频处理 ===")
    print(f"BV号: {args.bv_id}")
    print(f"配置文件: {args.config}")
    print(f"音频目录: {args.audios_dir}")

    # 解析配置文件
    config = parse_config_file(args.config)

    # 处理视频
    process_video(
        bv_id=args.bv_id,
        config=config,
        audios_dir=args.audios_dir,
        vad_threshold=args.vad_threshold,
        min_speech_duration=args.min_speech_duration,
        min_silence_duration=args.min_silence_duration,
        similarity_threshold=args.similarity_threshold,
        min_speaker_duration=args.min_speaker_duration
    )

    print("\n=== 处理完成 ===")


if __name__ == "__main__":
    main()
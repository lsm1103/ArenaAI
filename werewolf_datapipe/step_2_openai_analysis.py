#!/usr/bin/env python3
"""
狼人杀比赛分析脚本 - 使用OpenAI API进行发言分析
简化版：只需要ASR日志作为输入，其余配置从.env读取
"""

import os
import json
import argparse
from typing import Dict, Any, List
from volcenginesdkarkruntime import Ark
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()


def load_prompts():
    """加载 pmt.py 中的 prompt"""
    import pmt
    return pmt.sys_prompt, pmt.user_prompt


def load_board_config(config_path: str) -> Dict[str, Any]:
    """加载版型配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_asr_log(asr_log_path: str) -> Dict[str, Any]:
    """加载ASR日志文件"""
    with open(asr_log_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_section_from_asr(
    asr_data: Dict[str, Any],
    start_label: str = None,
    end_label: str = None
) -> str:
    """从ASR日志中提取指定时间段的对话记录

    Args:
        asr_data: ASR日志数据
        start_label: 开始标签（如果为None，从头开始）
        end_label: 结束标签（如果为None，提取到末尾或下一个标记）

    Returns:
        提取的对话记录文本
    """
    merged_segments = asr_data.get('merged_segments', [])
    time_marks = asr_data.get('time_marks', [])

    if start_label is None:
        # 提取所有对话
        transcript_lines = []
        for segment in merged_segments:
            speaker = segment.get('display_speaker', segment.get('speaker', '未知'))
            text = segment.get('text', '')
            start_time = segment.get('start', '')
            end_time = segment.get('end', '')
            transcript_lines.append(f"[{start_time}-{end_time}] {speaker}: {text}")
        return '\n'.join(transcript_lines)

    # 找到开始和结束的时间点
    start_ms = None
    end_ms = None

    for mark in time_marks:
        if start_label in mark.get('label', ''):
            start_ms = mark['start_ms']
        elif end_label and end_label in mark.get('label', ''):
            end_ms = mark['start_ms']
            break

    if start_ms is None:
        raise ValueError(f"未找到开始标签: {start_label}")

    # 如果没有指定结束标签，找到下一个标记作为结束点
    if end_ms is None and end_label is None:
        for mark in time_marks:
            if mark['start_ms'] > start_ms:
                end_ms = mark['start_ms']
                break

    # 提取对话记录
    transcript_lines = []
    for segment in merged_segments:
        seg_start = segment['start_ms']

        # 判断片段是否在目标时间范围内
        if seg_start >= start_ms:
            if end_ms is None or seg_start < end_ms:
                speaker = segment.get('display_speaker', segment.get('speaker', '未知'))
                text = segment.get('text', '')
                start_time = segment.get('start', '')
                end_time = segment.get('end', '')
                transcript_lines.append(f"[{start_time}-{end_time}] {speaker}: {text}")
            else:
                break

    return '\n'.join(transcript_lines)


def build_user_prompt(
    user_prompt_template: str,
    match_name: str,
    board_type: str,
    board_config: Dict[str, Any],
    player_info: str,
    no_sheriff: List[str],
    asr_transcript: str,
    prev_analysis: str = ""
) -> str:
    """构建用户prompt

    Args:
        user_prompt_template: 用户prompt模板
        match_name: 比赛名称
        board_type: 版型名称
        board_config: 版型配置
        player_info: 玩家信息
        no_sheriff: 未上警玩家列表
        asr_transcript: ASR对话记录
        prev_analysis: 前序分析记录
    """
    roles = board_config.get('roles', '')
    action_seq = board_config.get('action_seq', '')
    rules = board_config.get('rules', '')

    # 格式化未上警玩家
    no_sheriff_text = '、'.join(no_sheriff) if no_sheriff else '无'

    # 填充模板 - 现在有9个参数
    return user_prompt_template % (
        match_name,
        board_type,
        roles,
        action_seq,
        rules,
        player_info,
        no_sheriff_text,
        asr_transcript,
        prev_analysis
    )


def group_segments_by_speaker(merged_segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按发言人分组对话片段，每个发言人的连续发言作为一组
    
    Args:
        merged_segments: 合并后的对话片段列表
        
    Returns:
        按发言人分组的发言列表，每个元素包含：
        - speaker: 发言人
        - segments: 该发言人的连续片段列表
        - transcript: 该发言人的完整发言文本
        - start_time: 开始时间
        - end_time: 结束时间
    """
    if not merged_segments:
        return []
    
    grouped_speeches = []
    current_speaker = None
    current_segments = []
    
    for segment in merged_segments:
        speaker = segment.get('display_speaker', segment.get('speaker', '未知'))
        
        # 跳过法官和未知发言（可选）
        if speaker in ['法官', '未知']:
            # 如果有当前发言人的片段，先保存
            if current_segments:
                grouped_speeches.append({
                    'speaker': current_speaker,
                    'segments': current_segments.copy(),
                    'transcript': '\n'.join(f"[{seg.get('start', '')}-{seg.get('end', '')}] {current_speaker}: {seg.get('text', '')}" for seg in current_segments),
                    'start_time': current_segments[0].get('start', ''),
                    'end_time': current_segments[-1].get('end', ''),
                    'start_ms': current_segments[0].get('start_ms', 0),
                    'end_ms': current_segments[-1].get('end_ms', 0)
                })
                current_segments = []
                current_speaker = None
            continue
            
        if current_speaker != speaker:
            # 发言人变化，保存前一个发言人的片段
            if current_segments:
                grouped_speeches.append({
                    'speaker': current_speaker,
                    'segments': current_segments.copy(),
                    'transcript': '\n'.join(f"[{seg.get('start', '')}-{seg.get('end', '')}] {current_speaker}: {seg.get('text', '')}" for seg in current_segments),
                    'start_time': current_segments[0].get('start', ''),
                    'end_time': current_segments[-1].get('end', ''),
                    'start_ms': current_segments[0].get('start_ms', 0),
                    'end_ms': current_segments[-1].get('end_ms', 0)
                })
            
            # 开始新的发言人
            current_speaker = speaker
            current_segments = [segment]
        else:
            # 同一发言人，添加片段
            current_segments.append(segment)
    
    # 保存最后一个发言人的片段
    if current_segments:
        grouped_speeches.append({
            'speaker': current_speaker,
            'segments': current_segments.copy(),
            'transcript': '\n'.join(f"[{seg.get('start', '')}-{seg.get('end', '')}] {current_speaker}: {seg.get('text', '')}" for seg in current_segments),
            'start_time': current_segments[0].get('start', ''),
            'end_time': current_segments[-1].get('end', ''),
            'start_ms': current_segments[0].get('start_ms', 0),
            'end_ms': current_segments[-1].get('end_ms', 0)
        })
    
    return grouped_speeches


def call_openai_api(
    sys_prompt: str,
    user_prompt: str,
    api_key: str,
    base_url: str = None,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> str:
    """调用OpenAI API进行分析

    Args:
        sys_prompt: 系统prompt
        user_prompt: 用户prompt
        api_key: OpenAI API密钥
        base_url: API基础URL（可选，用于自定义endpoint）
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大token数

    Returns:
        API返回的分析结果
    """
    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url
    print("client_kwargs: ", client_kwargs)
    client = Ark(**client_kwargs)
    print("user_prompt: ", user_prompt)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=temperature,
        max_tokens=max_tokens
    )

    return response.choices[0].message.content


def progressive_analysis(
    grouped_speeches: List[Dict[str, Any]],
    sys_prompt: str,
    user_prompt_template: str,
    match_name: str,
    board_type: str,
    board_config: Dict[str, Any],
    player_info: str,
    no_sheriff: List[str],
    api_key: str,
    base_url: str = None,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> str:
    """逐段分析发言
    
    Args:
        grouped_speeches: 按发言人分组的发言列表
        sys_prompt: 系统prompt
        user_prompt_template: 用户prompt模板
        match_name: 比赛名称
        board_type: 版型名称
        board_config: 版型配置
        player_info: 玩家信息
        no_sheriff: 未上警玩家列表
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大token数
    
    Returns:
        完整的分析结果
    """
    all_analysis = []
    prev_analysis = ""
    
    for i, speech in enumerate(grouped_speeches):
        speaker = speech['speaker']
        transcript = speech['transcript']
        
        print(f"\n=== 分析第 {i+1}/{len(grouped_speeches)} 位发言人: {speaker} ===")
        print(f"发言时间: {speech['start_time']}-{speech['end_time']}")
        print(f"发言内容: {transcript[:100]}..." if len(transcript) > 100 else f"发言内容: {transcript}")
        
        # 构建当前轮次的prompt
        user_prompt = build_user_prompt(
            user_prompt_template,
            match_name,
            board_type,
            board_config,
            player_info,
            no_sheriff,
            transcript,
            prev_analysis
        )
        
        # 调用API进行分析
        try:
            current_analysis = call_openai_api(
                sys_prompt,
                user_prompt,
                api_key,
                base_url,
                model,
                temperature,
                max_tokens
            )
            
            # 添加分析结果
            analysis_section = f"\n=== 第{i+1}轮分析 - {speaker} ===\n{current_analysis}\n"
            all_analysis.append(analysis_section)
            
            # 更新前序分析记录
            prev_analysis = "\n".join(all_analysis)
            
            print(f"✅ 完成 {speaker} 的分析")
            
        except Exception as e:
            print(f"❌ 分析 {speaker} 时出错: {e}")
            error_section = f"\n=== 第{i+1}轮分析 - {speaker} ===\n分析失败: {str(e)}\n"
            all_analysis.append(error_section)
    
    return "\n".join(all_analysis)


def save_analysis_result(
    output_path: str,
    analysis_text: str,
    metadata: Dict[str, Any] = None
):
    """保存分析结果

    Args:
        output_path: 输出文件路径
        analysis_text: 分析文本
        metadata: 元数据（可选）
    """
    # 保存JSON格式
    result = {
        "analysis": analysis_text,
        "metadata": metadata or {}
    }

    json_path = output_path.replace('.txt', '.json') if output_path.endswith('.txt') else output_path + '.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # 保存纯文本格式
    txt_path = output_path.replace('.json', '.txt') if output_path.endswith('.json') else output_path + '.txt'
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(analysis_text)

    print(f"分析结果已保存:")
    print(f"  JSON: {json_path}")
    print(f"  TXT:  {txt_path}")


def main():
    parser = argparse.ArgumentParser(description='狼人杀比赛分析脚本（简化版）')
    parser.add_argument('asr_log', help='ASR日志文件路径（JSON格式）')
    parser.add_argument('--output', help='输出文件路径（可选，默认为 analysis/{bv_id}_sheriff_election.txt）')

    args = parser.parse_args()

    # 从环境变量读取配置
    api_key = os.environ.get('OPENAI_API_KEY')
    base_url = os.environ.get('OPENAI_BASE_URL')
    model = os.environ.get('OPENAI_MODEL', 'gpt-4o')
    temperature = float(os.environ.get('OPENAI_TEMPERATURE', '0.7'))
    max_tokens = int(os.environ.get('OPENAI_MAX_TOKENS', '4096'))
    board_config_path = os.environ.get('BOARD_CONFIG_PATH', 'configs/board_config.json')

    if not api_key:
        raise ValueError("必须设置环境变量 OPENAI_API_KEY")

    # 加载ASR日志
    print("加载ASR日志...")
    asr_data = load_asr_log(args.asr_log)

    # 从ASR日志中读取信息
    match_name = asr_data.get('match_name', '未命名比赛')
    board_type = asr_data.get('board_type', '未知版型')
    video_name = asr_data.get('video_name', 'unknown')
    speaker_roles = asr_data.get('speaker_roles', {})
    speaker_seqs = asr_data.get('speaker_seqs', {})
    no_sheriff = asr_data.get('no_sheriff', [])
    time_marks = asr_data.get('time_marks', [])

    print("=== 狼人杀比赛分析 ===")
    print(f"比赛名称: {match_name}")
    print(f"版型: {board_type}")
    print(f"ASR日志: {args.asr_log}")
    print(f"模型: {model}")

    # 固定分析时段：第一天-白天-警徽竞选（警上）到下一个section
    section_start = "第一天-白天-警徽竞选（警上）"

    # 查找开始标记
    start_mark = None
    next_mark = None

    for i, mark in enumerate(time_marks):
        if section_start in mark.get('label', ''):
            start_mark = mark
            # 找到下一个标记作为结束
            if i + 1 < len(time_marks):
                next_mark = time_marks[i + 1]
            break

    if start_mark is None:
        raise ValueError(f"未找到时间标记: {section_start}")

    if next_mark:
        print(f"分析时段: {start_mark['label']} -> {next_mark['label']}")
        section_label = "sheriff_election"
    else:
        print(f"分析时段: {start_mark['label']} -> (结束)")
        section_label = "sheriff_election_to_end"

    # 确定输出路径
    if not args.output:
        os.makedirs('analysis', exist_ok=True)
        args.output = f"analysis/{video_name}_{section_label}.txt"

    print(f"输出文件: {args.output}")
    print()

    # 1. 加载prompts
    print("加载prompts...")
    sys_prompt, user_prompt_template = load_prompts()

    # 2. 加载版型配置
    print("加载版型配置...")
    board_configs = load_board_config(board_config_path)
    if board_type not in board_configs:
        raise ValueError(f"版型 '{board_type}' 不存在于配置文件中。可用版型: {list(board_configs.keys())}")
    board_config = board_configs[board_type]

    # 3. 提取对话记录
    print("提取对话记录...")
    # 找到目标时间段内的segments
    target_segments = []
    start_ms = start_mark['start_ms']
    end_ms = next_mark['start_ms'] if next_mark else None
    
    for segment in asr_data.get('merged_segments', []):
        seg_start = segment['start_ms']
        if seg_start >= start_ms:
            if end_ms is None or seg_start < end_ms:
                target_segments.append(segment)
            else:
                break
    
    print(f"提取到 {len(target_segments)} 个对话片段")
    
    # 按发言人分组
    print("按发言人分组对话...")
    grouped_speeches = group_segments_by_speaker(target_segments)
    print(f"分组后共 {len(grouped_speeches)} 位发言人")
    
    # 显示发言顺序
    print("发言顺序:")
    for i, speech in enumerate(grouped_speeches):
        print(f"  第{i+1}位: {speech['speaker']} ({speech['start_time']}-{speech['end_time']})")

    # 4. 构建玩家信息
    print("构建玩家信息...")
    player_info_lines = []

    # 按序号排序
    players = [(seq, name) for name, seq in speaker_seqs.items() if seq and seq != '无' and name != '法官']

    # 简单排序（一号、二号...）
    def seq_sort_key(item):
        seq = item[0]
        num_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
                   '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
                   '十一': 11, '十二': 12}
        return num_map.get(seq.replace('号', ''), 99)

    players.sort(key=seq_sort_key)

    # 构建玩家信息（不显示身份，保持第三方分析视角）
    for seq, name in players:
        player_info_lines.append(f"{seq} {name}")

    # 添加法官
    for name, seq in speaker_seqs.items():
        if name == '法官':
            player_info_lines.append(f"法官 {name}")
            break

    player_info = '\n'.join(player_info_lines)

    # 调试输出
    print(f"构建的玩家信息:")
    for line in player_info_lines:
        print(f"  {line}")
    print(f"未上警玩家: {no_sheriff}")

    # 5. 逐段分析
    print("开始逐段分析...")
    analysis_result = progressive_analysis(
        grouped_speeches,
        sys_prompt,
        user_prompt_template,
        match_name,
        board_type,
        board_config,
        player_info,
        no_sheriff,
        api_key,
        base_url,
        model,
        temperature,
        max_tokens
    )

    print("\n🎉 所有发言分析完成！")

    # 7. 保存结果
    metadata = {
        "match_name": match_name,
        "board_type": board_type,
        "asr_log": args.asr_log,
        "section_start": start_mark['label'] if start_mark else None,
        "section_end": next_mark['label'] if next_mark else None,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "analysis_type": "progressive",
        "total_speakers": len(grouped_speeches),
        "speakers": [speech['speaker'] for speech in grouped_speeches]
    }

    save_analysis_result(args.output, analysis_result, metadata)

    print("\n=== 处理完成 ===")


if __name__ == "__main__":
    main()
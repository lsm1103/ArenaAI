#!/usr/bin/env python3
"""
狼人杀分析口语化解说脚本
将逐段分析结果转换为口语化的竞技解说风格
"""

import os
import json
import argparse
import re
from typing import Dict, Any, List
from volcenginesdkarkruntime import Ark
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()


def load_prompts():
    """加载 pmt.py 中的口语化解说 prompt"""
    import pmt
    return pmt.sys_pmt_oral, pmt.user_pmt_oral


def load_analysis_file(analysis_path: str) -> str:
    """加载分析文件"""
    with open(analysis_path, 'r', encoding='utf-8') as f:
        return f.read()


def load_config_json(config_path: str) -> Dict[str, Any]:
    """加载ASR配置JSON文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_board_config(config_path: str) -> Dict[str, Any]:
    """加载版型配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def split_analysis_by_rounds(analysis_text: str) -> List[Dict[str, Any]]:
    """按轮次分割分析结果
    
    Args:
        analysis_text: 完整的分析文本
        
    Returns:
        轮次列表，每个元素包含：
        - round_num: 轮次编号
        - speaker: 发言人
        - content: 分析内容
    """
    rounds = []
    
    # 匹配模式：=== 第X轮分析 - 发言人 ===
    pattern = r'=== 第(\d+)轮分析 - (.+?) ===\n(.*?)(?=\n=== 第\d+轮分析 -|\Z)'
    
    matches = re.finditer(pattern, analysis_text, re.DOTALL)
    
    for match in matches:
        round_num = int(match.group(1))
        speaker = match.group(2).strip()
        content = match.group(3).strip()
        
        rounds.append({
            'round_num': round_num,
            'speaker': speaker,
            'content': content
        })
    
    return rounds


def build_oral_sys_prompt(
    sys_prompt_template: str,
    match_name: str,
    board_type: str,
    board_config: Dict[str, Any],
    player_info: str,
    no_sheriff: List[str]
) -> str:
    """构建口语化解说的系统prompt
    
    Args:
        sys_prompt_template: 系统prompt模板
        match_name: 比赛名称
        board_type: 版型名称
        board_config: 版型配置
        player_info: 玩家信息
        no_sheriff: 未上警玩家列表
    """
    roles = board_config.get('roles', '')
    action_seq = board_config.get('action_seq', '')
    rules = board_config.get('rules', '')
    
    # 格式化未上警玩家
    no_sheriff_text = '、'.join(no_sheriff) if no_sheriff else '无'
    
    # 填充系统prompt模板
    return sys_prompt_template % (
        match_name,
        board_type,
        roles,
        action_seq,
        rules,
        player_info,
        no_sheriff_text
    )


def build_oral_user_prompt(
    user_prompt_template: str,
    analysis_content: str
) -> str:
    """构建口语化解说的用户prompt
    
    Args:
        user_prompt_template: 用户prompt模板
        analysis_content: 分析内容
    """
    return user_prompt_template % analysis_content


def call_openai_api(
    sys_prompt: str,
    user_prompt: str,
    api_key: str,
    base_url: str = None,
    model: str = "gpt-4o",
    temperature: float = 0.8,
    max_tokens: int = 2048
) -> str:
    """调用OpenAI API进行口语化转换"""
    client_kwargs = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url
    
    client = Ark(**client_kwargs)
    
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


def extract_commentary(response: str) -> str:
    """从响应中提取解说内容"""
    # 尝试提取 <commentary> 标签内的内容
    match = re.search(r'<commentary>(.*?)</commentary>', response, re.DOTALL)
    if match:
        return match.group(1).strip()
    return response.strip()


def progressive_oral_commentary(
    rounds: List[Dict[str, Any]],
    sys_prompt: str,
    user_prompt_template: str,
    api_key: str,
    base_url: str = None,
    model: str = "gpt-4o",
    temperature: float = 0.8,
    max_tokens: int = 2048
) -> List[Dict[str, Any]]:
    """逐轮生成口语化解说
    
    Args:
        rounds: 分析轮次列表
        sys_prompt: 系统prompt
        user_prompt_template: 用户prompt模板
        api_key: API密钥
        base_url: API基础URL
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大token数
    
    Returns:
        包含口语化解说的轮次列表
    """
    oral_results = []
    
    for round_data in rounds:
        round_num = round_data['round_num']
        speaker = round_data['speaker']
        content = round_data['content']
        
        print(f"\n=== 转换第 {round_num} 轮解说 - {speaker} ===")
        
        # 构建用户prompt
        user_prompt = build_oral_user_prompt(user_prompt_template, content)
        
        try:
            # 调用API
            response = call_openai_api(
                sys_prompt,
                user_prompt,
                api_key,
                base_url,
                model,
                temperature,
                max_tokens
            )
            
            # 提取解说内容
            commentary = extract_commentary(response)
            
            oral_results.append({
                'round_num': round_num,
                'speaker': speaker,
                'original_analysis': content,
                'oral_commentary': commentary
            })
            
            print(f"✅ 完成 {speaker} 的解说转换")
            print(f"解说预览: {commentary[:100]}...")
            
        except Exception as e:
            print(f"❌ 转换 {speaker} 解说时出错: {e}")
            oral_results.append({
                'round_num': round_num,
                'speaker': speaker,
                'original_analysis': content,
                'oral_commentary': f"[解说生成失败: {str(e)}]"
            })
    
    return oral_results


def save_oral_results(
    output_path: str,
    oral_results: List[Dict[str, Any]],
    metadata: Dict[str, Any] = None
):
    """保存口语化解说结果
    
    Args:
        output_path: 输出文件路径
        oral_results: 口语化解说结果列表
        metadata: 元数据
    """
    # 保存JSON格式
    result = {
        "oral_commentary": oral_results,
        "metadata": metadata or {}
    }
    
    json_path = output_path.replace('.txt', '.json') if output_path.endswith('.txt') else output_path + '.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    # 保存纯文本格式
    txt_path = output_path.replace('.json', '.txt') if output_path.endswith('.json') else output_path + '.txt'
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write("=== 狼人杀比赛口语化解说 ===\n\n")
        
        for item in oral_results:
            f.write(f"【第{item['round_num']}轮 - {item['speaker']}】\n")
            f.write(f"{item['oral_commentary']}\n\n")
            f.write("-" * 80 + "\n\n")
    
    print(f"\n口语化解说已保存:")
    print(f"  JSON: {json_path}")
    print(f"  TXT:  {txt_path}")


def build_player_info(config_data: Dict[str, Any]) -> str:
    """从配置数据构建玩家信息"""
    speaker_seqs = config_data.get('speaker_seqs', {})
    
    player_info_lines = []
    
    # 按序号排序
    players = [(seq, name) for name, seq in speaker_seqs.items() if seq and seq != '无' and name != '法官']
    
    def seq_sort_key(item):
        seq = item[0]
        num_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
                   '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
                   '十一': 11, '十二': 12}
        return num_map.get(seq.replace('号', ''), 99)
    
    players.sort(key=seq_sort_key)
    
    for seq, name in players:
        player_info_lines.append(f"{seq} {name}")
    
    # 添加法官
    for name, seq in speaker_seqs.items():
        if name == '法官':
            player_info_lines.append(f"法官 {name}")
            break
    
    return '\n'.join(player_info_lines)


def main():
    parser = argparse.ArgumentParser(description='狼人杀分析口语化解说脚本')
    parser.add_argument('analysis_file', help='分析文本文件路径（step_10输出的txt文件）')
    parser.add_argument('config_json', help='原始ASR配置JSON文件路径')
    parser.add_argument('--output', help='输出文件路径（可选，默认为 oral/{video_name}_oral.txt）')
    
    args = parser.parse_args()
    
    # 从环境变量读取配置
    api_key = os.environ.get('OPENAI_API_KEY')
    base_url = os.environ.get('OPENAI_BASE_URL')
    model = os.environ.get('OPENAI_MODEL', 'gpt-4o')
    temperature = float(os.environ.get('OPENAI_TEMPERATURE_ORAL', '0.8'))
    max_tokens = int(os.environ.get('OPENAI_MAX_TOKENS_ORAL', '2048'))
    board_config_path = os.environ.get('BOARD_CONFIG_PATH', 'configs/board_config.json')
    
    if not api_key:
        raise ValueError("必须设置环境变量 OPENAI_API_KEY")
    
    print("=== 狼人杀分析口语化解说 ===")
    print(f"分析文件: {args.analysis_file}")
    print(f"配置文件: {args.config_json}")
    print(f"模型: {model}")
    print()
    
    # 1. 加载分析文件
    print("加载分析文件...")
    analysis_text = load_analysis_file(args.analysis_file)
    
    # 2. 分割分析轮次
    print("分割分析轮次...")
    rounds = split_analysis_by_rounds(analysis_text)
    print(f"找到 {len(rounds)} 轮分析")
    
    if not rounds:
        print("❌ 未找到分析轮次，请检查文件格式")
        return 1
    
    # 3. 加载配置
    print("加载配置信息...")
    config_data = load_config_json(args.config_json)
    
    match_name = config_data.get('match_name', '未命名比赛')
    board_type = config_data.get('board_type', '未知版型')
    video_name = config_data.get('video_name', 'unknown')
    no_sheriff = config_data.get('no_sheriff', [])
    
    # 4. 加载版型配置
    print("加载版型配置...")
    board_configs = load_board_config(board_config_path)
    if board_type not in board_configs:
        raise ValueError(f"版型 '{board_type}' 不存在于配置文件中")
    board_config = board_configs[board_type]
    
    # 5. 构建玩家信息
    print("构建玩家信息...")
    player_info = build_player_info(config_data)
    
    # 6. 加载口语化解说prompts
    print("加载解说prompts...")
    sys_prompt_template, user_prompt_template = load_prompts()
    
    # 7. 构建系统prompt
    sys_prompt = build_oral_sys_prompt(
        sys_prompt_template,
        match_name,
        board_type,
        board_config,
        player_info,
        no_sheriff
    )
    
    # 8. 确定输出路径
    if not args.output:
        os.makedirs('oral', exist_ok=True)
        args.output = f"oral/{video_name}_oral.txt"
    
    print(f"输出文件: {args.output}")
    print()
    
    # 9. 逐轮生成口语化解说
    print("开始生成口语化解说...")
    oral_results = progressive_oral_commentary(
        rounds,
        sys_prompt,
        user_prompt_template,
        api_key,
        base_url,
        model,
        temperature,
        max_tokens
    )
    
    print("\n🎉 所有解说生成完成！")
    
    # 10. 保存结果
    metadata = {
        "match_name": match_name,
        "board_type": board_type,
        "video_name": video_name,
        "analysis_file": args.analysis_file,
        "config_json": args.config_json,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "total_rounds": len(oral_results)
    }
    
    save_oral_results(args.output, oral_results, metadata)
    
    print("\n=== 处理完成 ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


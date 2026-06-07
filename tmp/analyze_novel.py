#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小说章节分析工具
分析每章的连贯性、重复内容和相似问题
"""
import os
import re
from collections import Counter

# 章节文件目录
CHAPTERS_DIR = "/tmp/novel_analysis/银环下的罚球线/chapters"

def clean_text(text):
    """清理文本，去除多余空白和标点"""
    # 统一标点符号
    text = text.replace('"', '"').replace('"', '"')
    text = text.replace(''', "'").replace(''', "'")
    # 去除多余空白
    text = ' '.join(text.split())
    return text

def get_chapter_content(filepath):
    """读取章节内容"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except Exception as e:
        print(f"读取文件错误 {filepath}: {e}")
        return ""

def extract_sentences(text):
    """提取句子"""
    # 按句号、问号、感叹号分割
    sentences = re.split(r'[。！？\n]+', text)
    sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 5]
    return sentences

def extract_key_phrases(text):
    """提取关键短语（名词+动词结构）"""
    # 提取篮球相关动作和场景描述
    patterns = [
        r'林晨.*?(投篮|运球|传球|防守|突破|起跳|转身|出手)',
        r'赵天宇.*?(投篮|运球|传球|防守|突破|起跳|转身|出手)',
        r'手环.*?(闪烁|发光|发热|震动|微光)',
        r'(篮球|球|球馆|球场|球场)',
        r'(苏晴|张胖子|王教练|李浩然)',
    ]
    phrases = []
    for pattern in patterns:
        matches = re.findall(pattern, text)
        phrases.extend(matches)
    return phrases

def check_sentence_repetition(sentences):
    """检查句子重复"""
    clean_sentences = [clean_text(s) for s in sentences]
    counter = Counter(clean_sentences)

    # 找出重复的句子
    repeated = [(sent, count) for sent, count in counter.items() if count > 1]
    repeated.sort(key=lambda x: x[1], reverse=True)
    return repeated

def check_similarity(sentence_list1, sentence_list2, threshold=0.7):
    """检查两章之间的相似度"""
    # 简单的基于词语重叠的相似度检查
    words1 = set()
    words2 = set()

    for sent in sentence_list1:
        words = re.findall(r'[\w]+', clean_text(sent))
        words1.update(words)

    for sent in sentence_list2:
        words = re.findall(r'[\w]+', clean_text(sent))
        words2.update(words)

    if not words1 or not words2:
        return 0

    intersection = words1 & words2
    union = words1 | words2

    similarity = len(intersection) / len(union)
    return similarity

def analyze_chapter_continuity(prev_chapter, curr_chapter, next_chapter):
    """分析章节连贯性"""
    issues = []

    if prev_chapter:
        prev_sentences = extract_sentences(prev_chapter)
        curr_sentences = extract_sentences(curr_chapter)

        # 检查是否有承接性的词汇（承接上一章的情节）
        continuity_markers = ['接着', '随后', '后来', '不一会儿', '此时', '与此同时',
                              '然而', '但是', '于是', '就这样', '原来', '回想起来']
        has_continuity = False
        for marker in continuity_markers:
            if marker in curr_chapter:
                has_continuity = True
                break

        if not has_continuity:
            issues.append("缺乏明显的承接性词汇")

    return issues

def main():
    # 获取所有章节文件
    chapter_files = sorted([f for f in os.listdir(CHAPTERS_DIR) if f.endswith('.txt')])

    print("=" * 80)
    print("《银环下的罚球线》章节分析报告")
    print("=" * 80)
    print()

    # 读取所有章节内容
    chapters = {}
    for chapter_file in chapter_files:
        chapter_num = chapter_file.split('章')[0].replace('第', '')
        filepath = os.path.join(CHAPTERS_DIR, chapter_file)
        content = get_chapter_content(filepath)
        chapters[chapter_num] = {
            'title': chapter_file.replace('.txt', ''),
            'content': content,
            'sentences': extract_sentences(content),
            'word_count': len(content)
        }

    print(f"共找到 {len(chapters)} 章")
    print()

    # 分析1：章节长度和完整性
    print("=" * 80)
    print("一、章节长度和完整性分析")
    print("=" * 80)
    print(f"{'章节':<10} {'标题':<40} {'字数':<10} {'状态':<10}")
    print("-" * 80)

    for num in sorted(chapters.keys()):
        chapter = chapters[num]
        word_count = chapter['word_count']

        # 判断是否可能被截断（少于100字）
        status = "正常"
        if word_count < 800:
            status = "可能截断"
        elif word_count < 1200:
            status = "偏短"

        print(f"{num:<10} {chapter['title'][:38]:<40} {word_count:<10} {status:<10}")

    print()

    # 分析2：章节连贯性
    print("=" * 80)
    print("二、章节连贯性分析")
    print("=" * 80)

    for i, num in enumerate(sorted(chapters.keys())):
        chapter = chapters[num]
        prev_chapter = chapters[sorted(chapters.keys())[i-1]]['content'] if i > 0 else None

        issues = analyze_chapter_continuity(prev_chapter, chapter['content'], None)

        if issues:
            print(f"第{num}章 - {chapter['title'][:30]}:")
            for issue in issues:
                print(f"  ⚠️  {issue}")
        else:
            print(f"第{num}章 - {chapter['title'][:30]}: ✓ 连贯性良好")
    print()

    # 分析3：章节间相似度
    print("=" * 80)
    print("三、章节间相似度分析（高于50%标记为可能相似）")
    print("=" * 80)

    chapter_nums = sorted(chapters.keys())
    for i in range(len(chapter_nums) - 1):
        num1, num2 = chapter_nums[i], chapter_nums[i+1]
        chapter1 = chapters[num1]
        chapter2 = chapters[num2]

        similarity = check_similarity(chapter1['sentences'], chapter2['sentences'])

        status = ""
        if similarity > 0.6:
            status = " ⚠️  高度相似"
        elif similarity > 0.5:
            status = " ⚠️  可能相似"
        elif similarity > 0.3:
            status = " 正常相似度"
        else:
            status = " 独立性强"

        print(f"第{num1}章 → 第{num2}章: {similarity*100:.1f}%{status}")
    print()

    # 分析4：句子重复检查
    print("=" * 80)
    print("四、章节内句子重复检查")
    print("=" * 80)

    for num in sorted(chapters.keys()):
        chapter = chapters[num]
        repeated = check_sentence_repetition(chapter['sentences'])

        if repeated:
            print(f"第{num}章 - {chapter['title'][:30]}:")
            for sent, count in repeated[:3]:  # 只显示前3个
                print(f"  重复{count}次: {sent[:60]}...")
        else:
            print(f"第{num}章 - {chapter['title'][:30]}: ✓ 无重复句子")
    print()

    # 分析5：关键角色出场频率
    print("=" * 80)
    print("五、关键角色出场频率")
    print("=" * 80)

    characters = {
        '林晨': 0,
        '赵天宇': 0,
        '苏晴': 0,
        '张胖子': 0,
        '王教练': 0,
        '手环': 0
    }

    for num in sorted(chapters.keys()):
        chapter = chapters[num]
        content = chapter['content']

        for char in characters:
            characters[char] += content.count(char)

    print(f"{'角色':<10} {'总出现次数':<15} {'平均每章':<15}")
    print("-" * 80)
    for char, count in characters.items():
        avg = count / len(chapters)
        print(f"{char:<10} {count:<15} {avg:.1f}")
    print()

    # 分析6：情节连贯性检查（基于关键词）
    print("=" * 80)
    print("六、情节连贯性检查（关键事件关键词）")
    print("=" * 80)

    key_events = {
        '手环': ['手环', '银色', '闪烁', '发光', '震动'],
        '篮球': ['篮球', '投篮', '运球', '传球', '防守', '突破'],
        '情感': ['心跳', '脸红', '暗恋', '喜欢', '关心'],
        '冲突': ['冷冷', '不屑', '嘲笑', '愤怒', '对视']
    }

    for num in sorted(chapters.keys()):
        chapter = chapters[num]
        content = chapter['content']

        print(f"第{num}章 - {chapter['title'][:35]}:")
        for event_type, keywords in key_events.items():
            count = sum(content.count(kw) for kw in keywords)
            if count > 0:
                print(f"  {event_type}: {count}次")
    print()

    # 总结
    print("=" * 80)
    print("七、总结")
    print("=" * 80)
    print()
    print("需要关注的问题：")
    print()
    print("1. 章节长度：")
    short_chapters = [(num, ch['word_count']) for num, ch in chapters.items() if ch['word_count'] < 1200]
    if short_chapters:
        for num, count in short_chapters:
            print(f"   ⚠️  第{num}章字数偏少（{count}字），可能内容不完整")
    else:
        print("   ✓ 所有章节长度合理")

    print()
    print("2. 章节连贯性：")
    # 检查是否有明显的不连贯
    disconnected = []
    for i, num in enumerate(sorted(chapters.keys())):
        if i > 0:
            prev_num = sorted(chapters.keys())[i-1]
            prev_chapter = chapters[prev_num]['content']
            curr_chapter = chapters[num]['content']

            # 检查是否有承接性词汇
            continuity_markers = ['接着', '随后', '后来', '不一会儿', '此时', '与此同时',
                                  '然而', '但是', '于是', '就这样', '原来']
            has_continuity = any(marker in curr_chapter for marker in continuity_markers)

            if not has_continuity:
                disconnected.append(f"第{prev_num}章 → 第{num}章")

    if disconnected:
        for d in disconnected:
            print(f"   ⚠️  {d} 缺乏明显的承接性")
    else:
        print("   ✓ 章节之间承接性良好")

    print()
    print("3. 重复内容：")
    total_repeated = sum(len(check_sentence_repetition(ch['sentences'])) for ch in chapters.values())
    if total_repeated > 0:
        print(f"   ⚠️  发现 {total_repeated} 处句子重复")
    else:
        print("   ✓ 未发现明显重复句子")

    print()

if __name__ == "__main__":
    main()

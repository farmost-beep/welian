#!/usr/bin/env python3
"""
classify_contacts.py — 微信通讯录批量分类

从 name/sub_relation/notes 三个信号源提取行业和关系类别。
dry-run 模式只输出统计和样本，不写文件。

用法:
  python3 classify_contacts.py --dry-run    # 只看结果
  python3 classify_contacts.py              # 写入 contacts.json
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

CONTACTS_FILE = Path("/Users/cyingfang/.welian/data/contacts.json")

# ============================================================
# 分类规则
# ============================================================

# 行业关键词 → (行业标签, relation)
INDUSTRY_KEYWORDS = [
    # 银行
    (['银行', '工行', '农行', '中行', '建行', '交行', '招行', '兴业银行',
      '浦发', '民生银行', '光大银行', '华夏银行', '平安银行', '宁波银行',
      '杭州银行', '微众银行', '邮储', '华瑞银行', '东亚银行', '花旗',
      '汇丰', '渣打', 'SMBC', '三井住友', '中信银行', '邮惠万家'],
     '金融-银行', '同行'),
    # 证券/期货
    (['证券', '期货', '股票', '券商', '盛达期货', '信达资产'],
     '金融-证券期货', '同行'),
    # 投资/资本/基金
    (['资本', '投资', '基金', '信托', '创投', 'PE', 'VC', '天使投资',
      '拓海资本', '云岫资本', '高捷资本', '德实资本', '元创资本',
      '天星资本', '挚信资本', '沣沅资本', '国民信托'],
     '金融-投资资本', '同行'),
    # 保险
    (['保险', '中美联泰', '大都会', '人寿', '太保', '平安保险'],
     '金融-保险', '同行'),
    # 支付/银联
    (['银联', '支付', '拉卡拉', '通联'],
     '金融-支付', '同行'),
    # 科技/互联网/AI（注意：'通讯'会匹配'微信通讯录导入'，已排除）
    (['科技', '大数据', '互联网', '软件', '智能',
      '神州数码', '烯牛数据', '计算机', '电子科学', '通信行业', '通讯行业'],
     '科技', '同行'),
    # 创业
    (['创业', '创投', '创始人', 'CEO', 'startup'],
     '创业', '创业'),
    # 学术/大学/研究
    (['大学', '学院', '研究', '学术', '教授', '学者', '博士',
      '华东政法', '中科大', '科大', '校友', 'USTC', '南科大'],
     '学术', '校友'),
    # 中学
    (['中学', '青田中学'],
     '同学-中学', '同学'),
    # 法律
    (['律师', '法律', '事务所', '上仲', '仲裁'],
     '法律', '同行'),
    # 咨询
    (['咨询', '顾问', 'McKinsey', 'BCG', 'Bain'],
     '咨询', '同行'),
    # 医疗
    (['医院', '医疗', '医药', '健康', '医生'],
     '医疗', '同行'),
    # 地产
    (['地产', '房地产', '置业', '万科', '保利'],
     '地产', '同行'),
    # 媒体
    (['媒体', '传媒', '新闻', '记者', '编辑'],
     '媒体', '同行'),
    # 政府/协会
    (['政府', '协会', '商会', '民建', '职教社', '秘书长'],
     '政府协会', '同行'),
    # 制造/仪器
    (['仪器', '制造', '工业', '迦南科技'],
     '制造', '同行'),
]

# sub_relation → (行业, relation) 映射
SUB_RELATION_MAP = {
    '中科大': ('学术-中科大', '校友'),
    '科大校友': ('学术-中科大', '校友'),
    '上海华瑞银行': ('金融-银行', '同行'),
    '东亚银行': ('金融-银行', '同行'),
    '邮储银行': ('金融-银行', '同行'),
    '邮惠万家银行': ('金融-银行', '同行'),
    '邮储银行-普惠金融事业部-科技金融处': ('金融-银行', '同行'),
    '邮储银行-普惠金融事业部': ('金融-银行', '同行'),
    '邮储银行总行': ('金融-银行', '同行'),
    '邮储上海分行': ('金融-银行', '同行'),
    '邮储银行上海分行': ('金融-银行', '同行'),
    '神州数码': ('科技', '同行'),
    '银联数据': ('金融-支付', '同行'),
    '中美联泰大都会': ('金融-保险', '同行'),
    '青田中学': ('同学-中学', '同学'),
    '华东政法大学': ('学术-华政', '校友'),
    '国企': ('国企', '同行'),
    '创业校友': ('创业', '校友'),
    '民建朋友': ('政府协会-民建', '同行'),
    '民建同志': ('政府协会-民建', '同行'),
    '民建中央/上海市委': ('政府协会-民建', '同行'),
    '学术/民建': ('政府协会-民建', '同行'),
    '盛达期货': ('金融-证券期货', '同行'),
    '烯牛数据': ('科技', '同行'),
    'SMBC（三井住友银行）': ('金融-银行', '同行'),
    '迦南科技集团': ('制造', '同行'),
    '大东方/均耀体系': ('其他-商业', '同行'),
}

# 陪伴型关系关键词（nurture）
NURTURE_KEYWORDS = {
    '妻子': ('家人-配偶', '家人'),
    '家人': ('家人', '家人'),
    '家庭成员': ('家人', '家人'),
    '儿子': ('家人-子女', '家人'),
    '大哥': ('家人-兄弟', '家人'),
    '二哥': ('家人-兄弟', '家人'),
    '本人': ('本人', '本人'),
}

# sub_relation 含"上海分行-"前缀的 → 邮储银行
def normalize_sub_relation(sub):
    if not sub:
        return ''
    for prefix in ['上海分行-', '邮储银行-']:
        if sub.startswith(prefix):
            return '邮储银行'
    return sub


def classify_one(c):
    """返回 (industry, relation, sub_relation_new, source)"""
    name = c.get('name', '')
    sub = c.get('sub_relation', '') or ''
    notes = str(c.get('notes', ''))
    rel = c.get('relation', '') or ''

    # 1. 陪伴型关系优先
    for kw, (ind, new_rel) in NURTURE_KEYWORDS.items():
        if kw in name or kw == rel:
            return ind, new_rel, sub, 'nurture-kw'

    # 2. sub_relation 精确映射
    sub_norm = normalize_sub_relation(sub)
    if sub_norm in SUB_RELATION_MAP:
        ind, new_rel = SUB_RELATION_MAP[sub_norm]
        return ind, new_rel, sub_norm, 'sub-map'

    # 3. sub_relation 关键词模糊匹配
    for kws, ind, new_rel in INDUSTRY_KEYWORDS:
        for kw in kws:
            if kw in sub:
                return ind, new_rel, sub, 'sub-kw'

    # 4. name 关键词
    for kws, ind, new_rel in INDUSTRY_KEYWORDS:
        for kw in kws:
            if kw in name:
                return ind, new_rel, sub, 'name-kw'

    # 4b. 科大学号格式（如 9115, 0413, SA15225, 02210 等）→ 校友
    if re.search(r'(^|\D)\d{4,5}($|\D)', name) or re.search(r'[A-Z]{1,3}\d{4,6}', name):
        # 排除手机号（11位）和长数字
        if not re.search(r'\d{11}', name) and not re.search(r'\d{8}', name):
            return '学术-中科大(学号)', '校友', sub, 'name-sid'

    # 5. notes 关键词（只对 AI补全 的 notes 匹配，跳过"微信通讯录导入"）
    if 'AI补全' in notes or '微信通讯录导入' not in notes:
        for kws, ind, new_rel in INDUSTRY_KEYWORDS:
            for kw in kws:
                if kw in notes:
                    return ind, new_rel, sub, 'notes-kw'

    # 6. 已有 relation 保留
    if rel and rel != '其他':
        return f'未细分-{rel}', rel, sub, 'keep-rel'

    # 7. 兜底
    return '未分类', '其他', sub, 'fallback'


def main():
    dry_run = '--dry-run' in sys.argv

    contacts = json.loads(CONTACTS_FILE.read_text(encoding='utf-8'))
    print(f"总联系人: {len(contacts)}")

    results = []
    industry_dist = Counter()
    relation_dist = Counter()
    source_dist = Counter()
    changes = 0
    samples_by_industry = defaultdict(list)

    for c in contacts:
        ind, new_rel, sub_new, source = classify_one(c)
        old_rel = c.get('relation', '')

        changed = (ind != c.get('industry', '') or
                   new_rel != old_rel or
                   sub_new != c.get('sub_relation', ''))
        if changed:
            changes += 1

        industry_dist[ind] += 1
        relation_dist[new_rel] += 1
        source_dist[source] += 1

        if len(samples_by_industry[ind]) < 5:
            samples_by_industry[ind].append({
                'name': c.get('name', ''),
                'old_rel': old_rel,
                'new_rel': new_rel,
                'industry': ind,
                'sub': sub_new,
                'source': source,
            })

        results.append({
            'id': c.get('id'),
            'industry': ind,
            'relation': new_rel,
            'sub_relation': sub_new,
            'source': source,
        })

    print(f"\n=== 分类结果统计 ===")
    print(f"有变更: {changes} / {len(contacts)}")

    print(f"\n--- 行业分布 (industry) ---")
    for k, v in industry_dist.most_common(30):
        print(f"  {v:5d}  {k}")

    print(f"\n--- 关系分布 (relation) ---")
    for k, v in relation_dist.most_common(20):
        print(f"  {v:5d}  {k}")

    print(f"\n--- 分类来源 ---")
    for k, v in source_dist.most_common():
        print(f"  {v:5d}  {k}")

    print(f"\n--- 各行业样本(前3) ---")
    for ind in list(industry_dist.keys())[:15]:
        print(f"\n  [{ind}] ({industry_dist[ind]}人)")
        for s in samples_by_industry[ind][:3]:
            print(f"    {s['name'][:20]:20s}  {s['old_rel']:6s}→{s['new_rel']:6s}  src={s['source']}")

    if dry_run:
        print(f"\n=== DRY RUN — 未写入文件 ===")
        print(f"确认后去掉 --dry-run 执行写入")
    else:
        # 写入：更新 contacts.json
        by_id = {r['id']: r for r in results}
        for c in contacts:
            r = by_id.get(c['id'])
            if r:
                c['relation'] = r['relation']
                c['sub_relation'] = r['sub_relation']
                c['industry'] = r['industry']
        backup = CONTACTS_FILE.with_suffix('.json.bak2')
        CONTACTS_FILE.rename(backup)
        CONTACTS_FILE.write_text(
            json.dumps(contacts, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        print(f"\n=== 已写入 {CONTACTS_FILE} ===")
        print(f"备份: {backup}")


if __name__ == '__main__':
    main()

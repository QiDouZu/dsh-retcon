#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
切割实验台账 · 丢弃必须留注释，注释必须有「后来」

原理：
  抛弃不是损毁，是**一次切断实验**。
  切掉 → 预测什么该还在 → 回来记「塌了 / 没事」。
  ⇒ 只有前三栏的注释是流水账；补上「后来」才是实验记录。

⇒ 所以这不是「回收站」，是实验台：
  切掉 → 预测什么该还在 → 回来记「塌了 / 没事」

用法：
  python scripts/cut_ledger.py cut <路径> --why "为什么觉得它不重要" [--pred "切掉后什么该还在"]
  python scripts/cut_ledger.py list                    # 未结案的（「后来」还空着）
  python scripts/cut_ledger.py back <ID> ok --note "没事，过了N天"   # 回访：没塌
  python scripts/cut_ledger.py back <ID> broke --note "谁塌了"       # 回访：塌了
  python scripts/cut_ledger.py restore <ID>            # 从回收拉回来
  python scripts/cut_ledger.py show <ID>               # 看一条全文

⚠ 硬约束：
  - cut 必须先写 --why，写不出理由 = 还没想清，不许切
  - 条目一旦落账，不许删，只能 back（那才是数据）
  - 目标在工作区外 → 拒；目标是关键路径 → 要 --force
"""
import io
import json
import os
import re
import shutil
import sys
import time

# 工作区根：优先环境变量，其次当前目录（不写死任何路径）
BASE = os.environ.get('SEAL_BASE') or os.getcwd()
LEDGER = os.path.join(BASE, '封存', '丢弃台账.json')
MD = os.path.join(BASE, '封存', '用过.md')
TRASH = os.path.join(BASE, '封存', '回收')
BEGIN = '<!-- BEGIN cut-ledger（脚本托管，别手改） -->'
END = '<!-- END cut-ledger -->'

# 手滑保护区：这些被切要 --force
GUARD = ['.git', '.env', 'secrets',
         os.path.join('封存', '丢弃台账.json'),
         os.path.join('scripts', 'cut_ledger.py')]

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


# ---------- 台账读写 ----------

def load():
    if not os.path.exists(LEDGER):
        return {'version': 1, 'items': []}
    with io.open(LEDGER, encoding='utf-8') as f:
        return json.load(f)


def save(d):
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with io.open(LEDGER, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def next_id(items):
    today = time.strftime('%Y%m%d')
    n = 1
    for it in items:
        if it['id'].startswith('C' + today):
            n = max(n, int(it['id'][-3:]) + 1)
    return 'C%s-%03d' % (today, n)


# ---------- 渲染到 用过.md ----------

def cell(s, limit=42):
    if not s:
        return '—'
    s = re.sub(r'[|\r\n]', ' ', str(s)).strip()
    return (s[:limit] + '…') if len(s) > limit else s


def render(d):
    items = d['items']
    open_n = [it for it in items if not it.get('later')]
    lines = [BEGIN, '',
             '## 切割实验台账（脚本托管 · 别手改这一节）',
             '',
             '> **它跟上面那些批次的区别：上面记「删了为什么敢删」，这里记「删了之后怎样」。**',
             '> **⇒ 「后来」空着的一条，就是还没下结论的实验。**',
             '> **⇒ 改这一节用脚本：`python scripts/cut_ledger.py back <ID> ok|broke --note "..."`**',
             '',
             '**未结案 %d 条 / 共 %d 条**' % (len(open_n), len(items)),
             '']
    if items:
        lines.append('| ID | 切了什么 | 以为什么 | 预测 | 后来 |')
        lines.append('|---|---|---|---|---|')
        for it in items[-60:]:
            later = it.get('later') or '⏳ 空着'
            if it.get('verdict') == 'broke':
                later = '❌ ' + later
            elif it.get('verdict') == 'ok':
                later = '✅ ' + later
            if it.get('restored'):
                later += '（已拉回）'
            lines.append('| %s | %s | %s | %s | %s |' % (
                it['id'], cell(it['path']), cell(it['why']),
                cell(it.get('pred')), cell(later, 60)))
        if len(items) > 60:
            lines.append('')
            lines.append('*（只显最近 60 条，全量在 `索引\\丢弃台账.json`）*')
    lines += ['', END]
    block = '\n'.join(lines)

    txt = io.open(MD, encoding='utf-8').read() if os.path.exists(MD) else '# 用过（删除留痕）\n'
    if BEGIN in txt and END in txt:
        txt = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END), block, txt, flags=re.S)
    else:
        txt = txt.rstrip() + '\n\n---\n\n' + block + '\n'
    io.open(MD, 'w', encoding='utf-8', newline='\n').write(txt)
    return block


# ---------- 子命令 ----------

def arg(flag, default=None):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def cmd_cut():
    if len(sys.argv) < 3 or sys.argv[2].startswith('--'):
        print('用法：cut <路径> --why "为什么觉得它不重要" [--pred "切掉后什么该还在"]')
        return 2
    raw = sys.argv[2]
    path = raw if os.path.isabs(raw) else os.path.join(BASE, raw)
    path = os.path.abspath(path)

    why = arg('--why')
    if not why:
        print('❌ 拒绝：--why 必填。写不出理由 = 还没想清，不许切。')
        return 1
    if not os.path.exists(path):
        print('❌ 不存在：%s' % path)
        return 1

    # 出了工作区就拒
    if not path.lower().startswith(BASE.lower() + os.sep):
        print('❌ 拒绝：目标在工作区外（%s）。要动工作区外的东西，自己动手，不走这个脚本。' % path)
        return 1

    rel = path[len(BASE) + 1:]
    hot = [g for g in GUARD if rel.lower().startswith(g.lower())]
    if hot and '--force' not in sys.argv:
        print('❌ 拒绝：%s 在保护名单里（%s）。真要多切一刀，加 --force。' % (rel, hot[0]))
        return 1

    d = load()
    cid = next_id(d['items'])
    batch = time.strftime('%Y%m%d_%H%M%S')
    dest_dir = os.path.join(TRASH, batch)
    dest = os.path.join(dest_dir, os.path.basename(path))
    os.makedirs(dest_dir, exist_ok=True)
    shutil.move(path, dest)

    item = {
        'id': cid,
        'ts': time.strftime('%Y-%m-%d %H:%M:%S'),
        'path': rel,
        'kind': 'dir' if os.path.isdir(dest) else 'file',
        'size': dirsize(dest) if os.path.isdir(dest) else os.path.getsize(dest),
        'why': why,
        'pred': arg('--pred', ''),
        'trash': os.path.relpath(dest, BASE),
        'later': None,
        'verdict': None,
        'restored': False,
    }
    d['items'].append(item)
    save(d)
    render(d)

    print('✅ 已切：%s → %s' % (rel, item['trash']))
    print('   台账：%s（第 ④ 栏空着，它还没结案）' % cid)
    print('   回访：python scripts/cut_ledger.py back %s ok|broke --note "..."' % cid)
    return 0


def dirsize(p):
    t = 0
    for r, _, fs in os.walk(p):
        for f in fs:
            try:
                t += os.path.getsize(os.path.join(r, f))
            except OSError:
                pass
    return t


def cmd_back():
    if len(sys.argv) < 5:
        print('用法：back <ID> ok|broke --note "后来怎样了"')
        return 2
    cid, verdict = sys.argv[2], sys.argv[3]
    if verdict not in ('ok', 'broke'):
        print('❌ verdict 只能是 ok（没事）或 broke（塌了）')
        return 1
    note = arg('--note')
    if not note:
        print('❌ 拒绝：--note 必填。只写「ok/broke」不是结果，是情绪。')
        return 1
    d = load()
    for it in d['items']:
        if it['id'] == cid:
            it['later'] = '%s · %s' % (time.strftime('%m-%d %H:%M'), note)
            it['verdict'] = verdict
            save(d)
            render(d)
            print('✅ %s 结案：%s —— %s' % (cid, verdict, note))
            if verdict == 'broke':
                print('   ⇒ 塌了说明它原来是承重的。要拉回：python scripts/cut_ledger.py restore %s' % cid)
            return 0
    print('❌ 没有这一条：%s' % cid)
    return 1


def cmd_restore():
    if len(sys.argv) < 3:
        print('用法：restore <ID>')
        return 2
    cid = sys.argv[2]
    d = load()
    for it in d['items']:
        if it['id'] == cid:
            src = os.path.join(BASE, it['trash'])
            dst = os.path.join(BASE, it['path'])
            if not os.path.exists(src):
                print('❌ 回收里没有：%s' % src)
                return 1
            if os.path.exists(dst):
                print('❌ 原位置已被占用：%s（不覆盖）' % dst)
                return 1
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            it['restored'] = True
            if not it['later']:
                it['later'] = '%s · 拉回（切断后塌了/要用）' % time.strftime('%m-%d %H:%M')
                it['verdict'] = it['verdict'] or 'broke'
            save(d)
            render(d)
            print('✅ %s 已拉回：%s' % (cid, it['path']))
            return 0
    print('❌ 没有这一条：%s' % cid)
    return 1


def cmd_list():
    d = load()
    openn = [it for it in d['items'] if not it.get('later')]
    if not d['items']:
        print('台账还是空的。第一次切东西时用：python scripts/cut_ledger.py cut <路径> --why "..."')
        return 0
    print('共 %d 条，未结案 %d 条' % (len(d['items']), len(openn)))
    if not openn:
        print('✅ 全结案了。')
        return 0
    print('')
    print('%-14s %-38s %s' % ('ID', '切了什么', '以为什么'))
    for it in openn:
        print('%-14s %-38s %s' % (it['id'], cell(it['path'], 36), cell(it['why'], 50)))
    print('')
    print('⇒ 每条空着的「后来」，就是一件悬而未决的实验。')
    return 0


def cmd_show():
    if len(sys.argv) < 3:
        print('用法：show <ID>')
        return 2
    for it in load()['items']:
        if it['id'] == sys.argv[2]:
            for k, v in it.items():
                print('%-9s %s' % (k, v))
            return 0
    print('❌ 没有这一条')
    return 1


def cmd_audit():
    """查三件事：绕过的、烂掉的、赖着不结案的。"""
    d = load()
    items = d['items']
    bad = 0

    # ① 回收区里有、台账里没有  → 有人手删/手移，绕过了注释
    onbook = {os.path.normcase(os.path.basename(it['trash'])) for it in items}
    if os.path.isdir(TRASH):
        for batch in sorted(os.listdir(TRASH)):
            bdir = os.path.join(TRASH, batch)
            if not os.path.isdir(bdir):
                continue
            for name in os.listdir(bdir):
                if os.path.normcase(name) not in onbook:
                    print('⚠ 绕过了台账：%s\\%s（回收里有，台账没有）' % (batch, name))
                    bad += 1

    # ② 台账说切了，回收里没有，也没拉回 → 那是真删了，切断实验做不成了
    for it in items:
        if not it.get('restored') and not os.path.exists(os.path.join(BASE, it['trash'])):
            print('❌ %s 切了但回收里没有：%s（实验做不成，只能算删除）' % (it['id'], it['path']))
            bad += 1

    # ③ 未结案超过 7 天
    now = time.time()
    for it in items:
        if it.get('later'):
            continue
        try:
            age = (now - time.mktime(time.strptime(it['ts'], '%Y-%m-%d %H:%M:%S'))) / 86400
        except Exception:
            continue
        if age > 7:
            print('⏳ %s 挂了 %.0f 天还没「后来」：%s' % (it['id'], age, it['path']))
            bad += 1

    if bad == 0:
        print('✅ 台账、回收区、结案状态三者一致（共 %d 条）' % len(items))
    else:
        print('\n⇒ 一共 %d 处要收。没结案的丢弃不算知识，只算流水账。' % bad)
    return 0 if bad == 0 else 1


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 0
    return {'cut': cmd_cut, 'back': cmd_back, 'restore': cmd_restore,
            'list': cmd_list, 'show': cmd_show,
            'audit': cmd_audit}.get(sys.argv[1], lambda: (print(__doc__), 0)[1])()


if __name__ == '__main__':
    sys.exit(main())

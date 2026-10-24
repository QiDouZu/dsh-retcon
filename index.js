/**
 * 回溯性重构 · dsh-retro v0.1.0
 *
 * 一句话：**一条不能被推翻的记忆，不许写。**
 *
 * 为什么只做这一条：
 *   别的记忆工具在比「记得多准、记得多少」。
 *   这一条不提高上限，它提高下限 —— 写不进没有推翻条件的东西。
 *
 * 它不规定你记什么，只规定「写下来」这个动作的格式：
 *   ① 你以为什么（假设）
 *   ② 凭什么（证据，要指到具体哪一句/哪一帧）
 *   ③ 我可能错在哪（至少两条）
 *   ④ 怎么推翻我（必填 —— 空着就拒绝写入）
 *
 * ⇒ ④ 空着的记忆不是记忆，是结论。结论会硬化，记忆不会。
 *
 * 插件只提供「结构 + 强制」，不提供内容。
 * 你记什么、信什么、怎么判，全是你的 —— 那是它不打算给你的部分。
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const name = 'retro'
export const inject = ['tools']

const DIRNAME = '封存'
const ARCHIVE = '原片'

/**
 * 工作区根，两种取法（顺序不能反）：
 *   ① 环境变量 SEAL_BASE —— 想固定位置就设它（跟 scripts/cut_ledger.py 用同一个变量名）
 *   ② 没设就用 process.cwd()，也就是你启动 DSH 时所在的目录
 *
 * ⚠ 不设 SEAL_BASE 时，换个目录启动 DSH 就会出现一个新的 封存/ —— 这是刻意的，
 *   但如果你要的就是「所有项目共用一个封存库」，请设 SEAL_BASE。
 */
function baseDir() {
  return process.env.SEAL_BASE || process.cwd()
}

function dirOf() {
  return join(baseDir(), DIRNAME)
}

/** 当前本地时间戳（YYYY-MM-DD HH:MM） */
function now() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function dayStamp() {
  return now().slice(0, 10).replace(/-/g, '')
}

/** 文件名安全化，保留中文 */
function slugify(s) {
  return String(s)
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'untitled'
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
  return p
}

/** 找已存在的封存文件（支持传 id 或文件名） */
function resolveSeal(target) {
  const dir = dirOf()
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))
  if (files.includes(target)) return join(dir, target)
  const hit = files.filter(f => f.includes(target))
  return hit.length === 1 ? join(dir, hit[0]) : null
}

// ───────────────────────────── 工具 1：写封存

function buildSeal({ title, claim, evidence, can_refute, guess_wrong, source, origin, derive_from }) {
  const lines = []
  lines.push(`# ${title}`)
  lines.push('')
  if (derive_from) lines.push(`> 衍生自：${String(derive_from).trim()}`)
  lines.push(`> 封存时间：${now()}`)
  lines.push('> ⚠ 第一节写完不改。错了也留着 —— 更正写在「后来」里，写的时候注明「只加不改」。')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 一、我的假设（原文，写完不改）')
  lines.push('')
  lines.push('### 那是什么')
  lines.push('')
  lines.push('> ⚠ 这句要以「我以为 / 我猜 / 初步看」开头。写成「X 是 Y」的陈述句，就等于把它当事实了。')
  lines.push('')
  lines.push(claim.trim())
  lines.push('')
  lines.push('### 凭什么这么假设')
  lines.push('')
  evidence.forEach((e, i) => lines.push(`${i + 1}. ${e.trim()}`))
  lines.push('')
  lines.push('### 我可能错在哪')
  lines.push('')
  if (guess_wrong && guess_wrong.length) {
    guess_wrong.forEach((g, i) => lines.push(`${i + 1}. ${g.trim()}`))
  } else {
    lines.push('（你说的，但没细列 —— 这里留空不是没有，是没写。）')
  }
  lines.push('')
  lines.push('### 怎么推翻我')
  lines.push('')
  lines.push(can_refute.trim())
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 二、原片（指针）')
  lines.push('')
  lines.push('| 项 | 值 |')
  lines.push('|---|---|')
  if (source) lines.push(`| 源 | ${source} |`)
  if (origin) lines.push(`| 原片位置 | ${origin} |`)
  lines.push(`| 存档时间 | ${now()} |`)
  lines.push('')
  lines.push('> ⚠ **原片要自己存。** 没有原片的判断，事后补不回它当时的横轴。')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 三、后来')
  lines.push('')
  lines.push('（空着 = 还没结案。**没结案的封存不算知识，只算一个猜想。**）')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 四、注释（推翻时写）')
  lines.push('')
  lines.push('（每次推翻：以为什么 → 实际什么 → 源自哪一条 → 得出什么别的看法。')
  lines.push(' **✅ 成长性**：这一条之后，那套东西（标准/规则/工具）改了哪一条。没改就写「无」。）')
  lines.push('')
  return lines.join('\n')
}

// ───────────────────────────── 工具 2：回访

function appendLater(file, verdict, note) {
  const path = resolveSeal(file)
  if (!path) return { ok: false, text: `找不到封存文件：${file}` }

  const mark = verdict === 'stood' ? '✅ 站住了' : verdict === 'broke' ? '❌ 塌了' : '⏳ 部分'
  const block = [
    '',
    `**${now()} · ${mark}**`,
    '',
    note.trim(),
    '',
  ].join('\n')

  let txt = readFileSync(path, 'utf8')
  if (txt.includes('（空着 = 还没结案。')) {
    txt = txt.replace('（空着 = 还没结案。**没结案的封存不算知识，只算一个猜想。**）', '')
  }
  txt = txt.replace(/## 三、后来\s*/, '## 三、后来\n')
  // 追加到「## 四、注释」之前
  const idx = txt.indexOf('## 四、注释')
  if (idx > 0) {
    txt = txt.slice(0, idx) + block + '\n' + txt.slice(idx)
  } else {
    txt = txt + block
  }
  writeFileSync(path, txt, 'utf8')
  return { ok: true, text: `已记：${path.split(/[\\/]/).pop()} → ${mark}` }
}

// ───────────────────────────── 工具 3：列未结案

function listUnsettled() {
  const dir = dirOf()
  if (!existsSync(dir)) return { ok: true, text: '还没有封存目录。第一条用 seal_write。' }
  const files = readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))
  const rows = []
  for (const f of files) {
    const txt = readFileSync(join(dir, f), 'utf8')
    const open = txt.includes('（空着 = 还没结案')
    if (open) rows.push(f)
  }
  if (!rows.length) return { ok: true, text: `共 ${files.length} 条，全部结案。` }
  return {
    ok: true,
    text: [
      `共 ${files.length} 条，未结案 ${rows.length} 条：`,
      '',
      ...rows.map(r => '  · ' + r),
      '',
      '⇒ 每一条空着的「后来」，都是一个还没验的猜想。',
    ].join('\n'),
  }
}

export function apply(ctx) {
  try {
    if (!ctx.tools || typeof ctx.tools.register !== 'function') return

    // ── seal_write
    ctx.tools.register({
      name: 'seal_write',
      description:
        '封存一条判断：假设 + 证据 + 我可能错在哪 + 怎么推翻我。' +
        '「怎么推翻我」必填 —— 写不出推翻条件的判断会被拒绝写入。' +
        '⚠ 只在极限处用：赌注大 / 反直觉 / 已在用但说不清凭什么 / 有人跟你说反的。' +
        '日常偏好、已确认事实、随手选择、情绪 —— 都不要封，那会把工具用成负担。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题（简短，会当文件名）' },
          claim: {
            type: 'string',
            description: '我的假设是什么。⚠ 要以「我以为 / 我猜 / 初步看」开头，别写成「X 是 Y」的陈述句',
          },
          evidence: {
            type: 'array',
            items: { type: 'string' },
            description: '凭什么这么假设：逐条，每条指到具体哪一句/哪一帧/哪次对话',
          },
          can_refute: {
            type: 'string',
            description: '怎么推翻我：一条可执行的验证。必填 —— 空着会被拒绝。',
          },
          guess_wrong: {
            type: 'array',
            items: { type: 'string' },
            description: '我可能错在哪（至少两条，最容易错的放第一）',
          },
          source: { type: 'string', description: '来源（BV号 / 文件路径 / 对话轮次）' },
          origin: { type: 'string', description: '原片存放位置（建议 封存\\原片\\<批次>）' },
          derive_from: {
            type: 'string',
            description: '衍生自哪一条（文件名 · 推翻生/裂缝生/边界生）。新的一刀如果是从旧的里长出来的，填这个',
          },
        },
        required: ['title', 'claim', 'evidence', 'can_refute'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string' } } },
        render: (_a, v) => [{ type: 'text', text: v?.text ?? '' }],
      },
      async execute(args) {
        const refute = String(args.can_refute || '').trim()
        if (!refute) {
          return {
            text:
              '拒绝封存：`can_refute` 为空。\n\n' +
              '⇒ 一条你怎么都想不到如何推翻的判断，不是判断，是信念。\n' +
              '⇒ 信念不是不能有 —— 但它不能混在「判断」里过夜。',
          }
        }
        const claim = String(args.claim || '').trim()
        if (!claim) return { text: '拒绝封存：没有假设内容。' }
        const evidence = (args.evidence || []).map(String).filter(Boolean)
        if (!evidence.length) {
          return { text: '拒绝封存：`evidence` 为空。说不出「凭什么」，那就还只是感觉。' }
        }

        ensureDir(dirOf())
        const file = `${dayStamp()}_${slugify(args.title)}.md`
        const path = join(dirOf(), file)
        const body = buildSeal({
          title: args.title,
          claim,
          evidence,
          can_refute: refute,
          guess_wrong: (args.guess_wrong || []).map(String).filter(Boolean),
          source: args.source,
          origin: args.origin,
          derive_from: args.derive_from,
        })
        writeFileSync(path, body, 'utf8')
        return {
          text:
            `已封存：${DIRNAME}\\${file}\n\n` +
            `⚠ 第③栏「后来」现在是空的 —— 它还没结案。\n` +
            `回访时：seal_later ${file} stood|broke --note "..."\n\n` +
            `⚠ 原片自己存到 ${ARCHIVE}\\ 下，别只存判断。`,
        }
      },
    })

    // ── seal_later
    ctx.tools.register({
      name: 'seal_later',
      description:
        '回访一条封存：验完之后记下「后来」——站住了还是塌了，以及为什么。' +
        '这是把猜想变成知识的那一步，不是可选项。',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: '封存文件名（或文件名里的一段，能唯一匹配）' },
          verdict: {
            type: 'string',
            enum: ['stood', 'broke', 'partial'],
            description: 'stood=站住了 / broke=塌了 / partial=部分',
          },
          note: { type: 'string', description: '后来到底怎么了：验了什么、结果如何、剩什么' },
        },
        required: ['file', 'verdict', 'note'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string' } } },
        render: (_a, v) => [{ type: 'text', text: v?.text ?? '' }],
      },
      async execute(args) {
        if (!String(args.note || '').trim()) {
          return { text: '拒绝：`note` 为空。只写「站住了/塌了」不是结果，是情绪。' }
        }
        const r = appendLater(args.file, args.verdict, args.note)
        return { text: r.text }
      },
    })

    // ── seal_list
    ctx.tools.register({
      name: 'seal_list',
      description: '列出还没结案的封存（「后来」空着的）。',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      output: {
        schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string' } } },
        render: (_a, v) => [{ type: 'text', text: v?.text ?? '' }],
      },
      async execute() {
        return { text: listUnsettled().text }
      },
    })
  } catch {
    /* 插件出错不影响 DSH 本身 */
  }
}

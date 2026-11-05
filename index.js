/**
 * MiniMax 音色复刻 + 文本转音频，DeepSeek Harness 插件（Host 半边）。
 *
 * 对外提供三样东西，全部围绕同一个能力内核：
 *   1. Cordis 服务 `minimaxVoice` —— 给其他插件在进程内直接调用；
 *   2. 三个 Agent 工具 —— 给模型调用；
 *   3. `/mmvoice/api` 本地 HTTP 面 —— 给 Web 面板调用。
 */
import * as fsp from 'node:fs/promises'
import { join, extname, isAbsolute, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

export const name = 'minimax-voice'
export const inject = ['tools']

const API_BASE = 'https://api.minimax.cn'
const DEFAULT_MODEL = 'speech-2.8-hd'
const TTS_MODELS = [
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
]
const EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'whisper']
const DEFAULT_PREVIEW_TEXT = '你好，这是复刻音色的试听效果，听一听是不是你熟悉的声音。'
const MAX_BODY_BYTES = 24 * 1024 * 1024
const ROUTE_PREFIX = '/mmvoice/api'

/* ------------------------------------------------------------------ utils */

function text(value) {
  return [{ type: 'text', text: value }]
}

function errorMessage(error) {
  if (!error) return '未知错误'
  const message = error.message || String(error)
  if (/1004/.test(message)) return `${message}（API Key 无效或权限不足，请在面板里重新填写）`
  if (/1002|1039/.test(message)) return `${message}（触发 MiniMax 限流，稍后重试）`
  return message
}

function mimeOf(filename) {
  const ext = extname(filename || '').toLowerCase()
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.m4a') return 'audio/mp4'
  if (ext === '.flac') return 'audio/flac'
  return 'audio/mpeg'
}

function makeVoiceId(label) {
  const slug = String(label || 'voice')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10) || 'voice'
  const stamp = Date.now().toString(36)
  const salt = randomBytes(2).toString('hex')
  let id = `mv${slug}${stamp}${salt}`
  if (!/^[a-zA-Z]/.test(id)) id = `mv${id}`
  return id.slice(0, 40)
}

function clampNumber(value, min, max, fallback) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function defaultDataDir() {
  const profile = process.env.DSH_PROFILE_DIR
  if (profile) return join(profile, 'minimax-voice')
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'minimax-voice')
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(file, value) {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  await fsp.mkdir(dirname(file), { recursive: true })
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

/* ------------------------------------------------------------- MiniMax API */

async function readResponse(res) {
  const raw = await res.text()
  let data
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(`MiniMax 返回了非 JSON 响应（HTTP ${res.status}）：${raw.slice(0, 180)}`)
  }
  const code = data && data.base_resp ? data.base_resp.status_code : undefined
  if (!res.ok || (code !== undefined && code !== 0)) {
    const msg = (data && data.base_resp && data.base_resp.status_msg) || `HTTP ${res.status}`
    throw new Error(`MiniMax 接口失败（${code === undefined ? res.status : code}）：${msg}`)
  }
  return data
}

async function callJson(apiKey, path, body, signal) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  return readResponse(res)
}

async function uploadAudio(apiKey, bytes, filename, purpose, signal) {
  const form = new FormData()
  form.append('purpose', purpose)
  form.append('file', new Blob([bytes], { type: mimeOf(filename) }), filename || 'sample.mp3')
  const res = await fetch(`${API_BASE}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  })
  const data = await readResponse(res)
  const fileId = data && data.file ? data.file.file_id : undefined
  if (fileId === undefined) throw new Error('上传音频失败：响应里没有 file.file_id')
  return fileId
}

/* ------------------------------------------------------------ the service */

function createVoice(ctx, config) {
  const dataDir = config.dataDir ? String(config.dataDir) : defaultDataDir()
  const audioDir = join(dataDir, 'audio')
  const outputDir = join(dataDir, 'output')
  const registryFile = join(dataDir, 'voices.json')
  const secretFile = join(dataDir, 'secret.json')
  const defaultModel = typeof config.model === 'string' && config.model ? config.model : DEFAULT_MODEL

  let cached = null

  async function resolveApiKey() {
    if (typeof config.apiKey === 'string' && config.apiKey.trim()) return config.apiKey.trim()
    const env = process.env.MINIMAX_API_KEY
    if (env && env.trim()) return env.trim()
    const secret = await readJson(secretFile, null)
    if (secret && typeof secret.apiKey === 'string' && secret.apiKey.trim()) return secret.apiKey.trim()
    return ''
  }

  async function requireApiKey() {
    const key = await resolveApiKey()
    if (!key) {
      throw new Error(
        '还没有配置 MiniMax API Key：请在 设置 → MiniMax 音色 里填写，或设置环境变量 MINIMAX_API_KEY 后重启 Harness。',
      )
    }
    return key
  }

  async function readRegistry() {
    if (cached) return cached
    const parsed = await readJson(registryFile, null)
    const voices = Array.isArray(parsed && parsed.voices) ? parsed.voices : []
    cached = { version: 1, voices }
    return cached
  }

  async function mutateRegistry(mutate) {
    const registry = await readRegistry()
    const next = { version: 1, voices: [...registry.voices] }
    const result = await mutate(next)
    await writeJson(registryFile, next)
    cached = next
    return result
  }

  function publicVoice(entry) {
    return {
      voiceId: entry.voiceId,
      name: entry.name,
      model: entry.model,
      createdAt: entry.createdAt,
      durationMs: entry.durationMs ?? null,
      previewPath: entry.previewFile ? join(audioDir, entry.previewFile) : null,
      sampleName: entry.sampleName || null,
    }
  }

  async function synthesizeOnce(apiKey, request, signal) {
    const voiceId = String(request.voiceId || '').trim()
    if (!voiceId) throw new Error('缺少 voiceId')
    const payload = String(request.text || '')
    if (!payload.trim()) throw new Error('缺少要合成的文本')
    if (payload.length > 10000) throw new Error('文本超过 10000 字符，请分段后再合成')

    const format = String(request.format || 'mp3').toLowerCase()
    const body = {
      model: request.model || defaultModel,
      text: payload,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: clampNumber(request.speed, 0.5, 2, 1),
        vol: clampNumber(request.vol, 0.01, 10, 1),
        pitch: Math.round(clampNumber(request.pitch, -12, 12, 0)),
      },
      audio_setting: {
        format,
        sample_rate: Number(request.sampleRate) || 32000,
        bitrate: 128000,
        channel: 1,
      },
      output_format: 'hex',
    }
    if (request.emotion && EMOTIONS.includes(request.emotion)) body.voice_setting.emotion = request.emotion
    if (request.languageBoost) body.language_boost = request.languageBoost

    const data = await callJson(apiKey, '/v1/t2a_v2', body, signal)
    const hex = data && data.data ? data.data.audio : undefined
    if (!hex) throw new Error('MiniMax 没有返回音频数据（data.audio 为空）')
    const bytes = Buffer.from(hex, 'hex')
    if (!bytes.length) throw new Error('MiniMax 返回的音频是空的')
    const info = data.extra_info || {}
    return {
      bytes,
      format,
      durationMs: info.audio_length ?? null,
      characters: info.usage_characters ?? payload.length,
      traceId: data.trace_id ?? null,
    }
  }

  async function saveOutput(bytes, format) {
    await fsp.mkdir(outputDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = join(outputDir, `tts-${stamp}-${randomBytes(3).toString('hex')}.${format}`)
    await fsp.writeFile(file, bytes)
    return file
  }

  async function resolveInputPath(path, exec) {
    if (!path) return ''
    if (isAbsolute(path)) return path
    let base = process.cwd()
    const wd = ctx.get('workingDirectory')
    if (wd && exec && exec.agent) {
      try {
        base = await wd.ensure(exec.agent, exec.signal)
      } catch {
        base = process.cwd()
      }
    }
    return join(base, path)
  }

  /* --- service surface --- */

  const api = {
    /** 当前配置状态（不泄露 key）。 */
    async status() {
      const key = await resolveApiKey()
      const registry = await readRegistry()
      return {
        configured: Boolean(key),
        keySource: key ? ((config.apiKey && config.apiKey.trim()) ? 'config' : (process.env.MINIMAX_API_KEY ? 'env' : 'file')) : null,
        dataDir,
        defaultModel,
        voiceCount: registry.voices.length,
      }
    },

    /** 已持久化的音色清单。 */
    async list() {
      const registry = await readRegistry()
      return registry.voices.map(publicVoice)
    },

    async get(voiceId) {
      const registry = await readRegistry()
      const found = registry.voices.find((entry) => entry.voiceId === voiceId)
      return found ? publicVoice(found) : null
    },

    /**
     * 复刻一个音色：上传样本 → /v1/voice_clone → 立刻合成一次试听并落盘。
     * 试听这一步同时把音色“激活”，否则 /v1/get_voice 查不到它。
     */
    async clone(request) {
      const apiKey = await requireApiKey()
      const signal = request.signal
      let bytes = request.bytes
      let filename = request.filename || 'sample.mp3'
      if (!bytes) {
        const source = await resolveInputPath(request.audioPath, request.exec)
        if (!source) throw new Error('缺少音频文件路径')
        const stat = await fsp.stat(source)
        if (!stat.isFile()) throw new Error(`不是文件：${source}`)
        if (stat.size > 20 * 1024 * 1024) throw new Error('样本音频超过 20MB')
        bytes = await fsp.readFile(source)
        filename = basename(source)
      }
      if (!bytes || !bytes.length) throw new Error('样本音频是空的')

      const displayName = String(request.name || '').trim() || '未命名音色'
      const model = request.model || defaultModel
      const previewText = String(request.previewText || '').trim() || DEFAULT_PREVIEW_TEXT
      const voiceId = request.voiceId || makeVoiceId(displayName)

      const fileId = await uploadAudio(apiKey, bytes, filename, 'voice_clone', signal)

      const cloneBody = { file_id: fileId, voice_id: voiceId, text: previewText, model }
      if (request.promptAudioPath) {
        const promptSource = await resolveInputPath(request.promptAudioPath, request.exec)
        const promptBytes = await fsp.readFile(promptSource)
        const promptFileId = await uploadAudio(apiKey, promptBytes, basename(promptSource), 'prompt_audio', signal)
        cloneBody.clone_prompt = { prompt_audio: promptFileId, prompt_text: String(request.promptText || '') }
      }
      if (typeof request.accuracy === 'number') cloneBody.accuracy = request.accuracy
      if (typeof request.needNoiseReduction === 'boolean') cloneBody.need_noise_reduction = request.needNoiseReduction

      await callJson(apiKey, '/v1/voice_clone', cloneBody, signal)

      const preview = await synthesizeOnce(apiKey, { voiceId, text: previewText, model }, signal)
      await fsp.mkdir(audioDir, { recursive: true })
      const previewFile = `${voiceId}.mp3`
      await fsp.writeFile(join(audioDir, previewFile), preview.bytes)

      const entry = {
        voiceId,
        name: displayName,
        model,
        createdAt: new Date().toISOString(),
        durationMs: preview.durationMs,
        previewFile,
        sampleName: filename,
        sampleBytes: bytes.length,
        previewText,
      }
      await mutateRegistry((registry) => {
        registry.voices = registry.voices.filter((item) => item.voiceId !== voiceId)
        registry.voices.unshift(entry)
      })
      return publicVoice(entry)
    },

    /** 用指定音色把文本合成为音频，写到 outPath 或插件输出目录。 */
    async synthesize(request) {
      const apiKey = await requireApiKey()
      const voiceId = request.voiceId || (await readRegistry()).voices[0]?.voiceId
      if (!voiceId) throw new Error('还没有任何音色：请先复刻一个，或传入系统音色 ID')
      const result = await synthesizeOnce(apiKey, { ...request, voiceId }, request.signal)
      const target = request.outPath
        ? await resolveInputPath(request.outPath, request.exec)
        : await saveOutput(result.bytes, result.format)
      if (request.outPath) {
        await fsp.mkdir(join(target, '..'), { recursive: true })
        await fsp.writeFile(target, result.bytes)
      }
      return {
        path: target,
        bytes: result.bytes.length,
        durationMs: result.durationMs,
        characters: result.characters,
        voiceId,
        model: request.model || defaultModel,
        traceId: result.traceId,
      }
    },

    /** 从本地注册表删除一个音色（不删除 MiniMax 账号侧的音色）。 */
    async remove(voiceId) {
      const registry = await readRegistry()
      const found = registry.voices.find((entry) => entry.voiceId === voiceId)
      if (!found) return false
      if (found.previewFile) {
        try {
          await fsp.unlink(join(audioDir, found.previewFile))
        } catch {
          /* 文件可能已不存在 */
        }
      }
      await mutateRegistry((next) => {
        next.voices = next.voices.filter((item) => item.voiceId !== voiceId)
      })
      return true
    },

    /** 读取某个音色的试听音频。 */
    async audio(voiceId) {
      const registry = await readRegistry()
      const found = registry.voices.find((entry) => entry.voiceId === voiceId)
      if (!found || !found.previewFile) return null
      const path = join(audioDir, found.previewFile)
      const bytes = await fsp.readFile(path)
      return { bytes, path, mime: mimeOf(found.previewFile) }
    },

    /** 保存 API Key 到插件数据目录（面板用）。 */
    async setApiKey(value) {
      const key = String(value || '').trim()
      if (!key) throw new Error('API Key 不能为空')
      await fsp.mkdir(dataDir, { recursive: true })
      await writeJson(secretFile, { apiKey: key, savedAt: new Date().toISOString() })
      return { configured: true }
    },

    /** 查询 MiniMax 账号侧已激活的复刻音色，用于和本地注册表对账。 */
    async remoteVoices() {
      const apiKey = await requireApiKey()
      const data = await callJson(apiKey, '/v1/get_voice', { voice_type: 'voice_cloning' })
      const list = Array.isArray(data.voice_cloning) ? data.voice_cloning : []
      return list.map((item) => ({
        voiceId: item.voice_id,
        createdAt: item.created_time ?? null,
        description: Array.isArray(item.description) ? item.description : [],
      }))
    },
  }

  /* --- HTTP surface for the panel --- */

  function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8')
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new Error('请求体超过 24MB'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  async function sendAudio(res, result) {
    if (!result) {
      sendJson(res, 404, { error: '音色不存在' })
      return
    }
    res.writeHead(200, {
      'content-type': result.mime,
      'content-length': String(result.bytes.length),
      'cache-control': 'no-store',
    })
    res.end(result.bytes)
  }

  async function handleHttp(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const path = url.pathname.startsWith(ROUTE_PREFIX)
        ? url.pathname.slice(ROUTE_PREFIX.length) || '/'
        : url.pathname
      const method = (req.method || 'GET').toUpperCase()
      const query = url.searchParams

      if (method === 'GET' && path === '/status') {
        sendJson(res, 200, await api.status())
        return
      }
      if (method === 'GET' && path === '/voices') {
        sendJson(res, 200, { voices: await api.list() })
        return
      }
      if (method === 'POST' && path === '/key') {
        const body = await readBody(req)
        const parsed = body.length ? JSON.parse(body.toString('utf8')) : {}
        sendJson(res, 200, await api.setApiKey(parsed.apiKey))
        return
      }
      if (method === 'POST' && path === '/clone') {
        const bytes = await readBody(req)
        const voice = await api.clone({
          bytes,
          filename: query.get('filename') || 'sample.mp3',
          name: query.get('name') || '未命名音色',
          model: query.get('model') || undefined,
          previewText: query.get('previewText') || undefined,
        })
        sendJson(res, 200, { voice })
        return
      }
      if (method === 'POST' && path === '/tts') {
        const body = await readBody(req)
        const parsed = body.length ? JSON.parse(body.toString('utf8')) : {}
        const result = await api.synthesize(parsed)
        sendJson(res, 200, {
          ...result,
          url: `${ROUTE_PREFIX}/output/${basename(result.path)}`,
        })
        return
      }
      if (method === 'GET' && path.startsWith('/output/')) {
        const file = basename(path.slice('/output/'.length))
        if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
          sendJson(res, 400, { error: '非法文件名' })
          return
        }
        try {
          const bytes = await fsp.readFile(join(outputDir, file))
          res.writeHead(200, {
            'content-type': mimeOf(file),
            'content-length': String(bytes.length),
            'cache-control': 'no-store',
          })
          res.end(bytes)
        } catch {
          sendJson(res, 404, { error: '音频不存在' })
        }
        return
      }
      if (method === 'GET' && path === '/remote') {
        sendJson(res, 200, { voices: await api.remoteVoices() })
        return
      }
      const parts = path.split('/').filter(Boolean)
      if (parts[0] === 'voices' && parts.length >= 2) {
        const voiceId = decodeURIComponent(parts[1])
        if (method === 'DELETE' && parts.length === 2) {
          sendJson(res, 200, { removed: await api.remove(voiceId) })
          return
        }
        if (method === 'GET' && parts.length === 3 && parts[2] === 'audio') {
          await sendAudio(res, await api.audio(voiceId))
          return
        }
      }
      sendJson(res, 404, { error: `未知接口 ${method} ${path}` })
    } catch (error) {
      try {
        sendJson(res, 500, { error: errorMessage(error) })
      } catch {
        try {
          res.destroy()
        } catch {
          /* socket already gone */
        }
      }
    }
  }

  return { api, handleHttp, dataDir }
}

/* ------------------------------------------------------------------ tools */

const VOICE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    voice_id: { type: 'string', description: '复刻得到的音色 ID' },
    name: { type: 'string', description: '音色名称' },
    model: { type: 'string', description: '复刻使用的模型' },
    preview_path: { type: 'string', description: '试听音频的本地路径' },
    duration_ms: { type: 'number', description: '试听音频时长（毫秒）' },
  },
  required: ['voice_id', 'name', 'model', 'preview_path'],
}

function cloneTool(voice) {
  return {
    name: 'minimax_voice_clone',
    description:
      '用一段 10 秒到 5 分钟的真人音频复刻音色（mp3/m4a/wav，≤20MB）。成功后返回持久化的 voice_id 和一段试听音频路径，后续可用 minimax_tts 或 minimaxVoice 服务使用该音色。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        audio_path: { type: 'string', description: '样本音频的本地路径（相对会话工作目录或绝对路径）' },
        name: { type: 'string', description: '音色名称，会写进 voice_id 并显示在音色库里' },
        preview_text: { type: 'string', description: '复刻后的试听文本，默认一句中文' },
        model: { type: 'string', enum: TTS_MODELS, description: `复刻模型，默认 ${DEFAULT_MODEL}` },
        prompt_audio_path: { type: 'string', description: '可选：示例音频路径（短于 8 秒），用于增强相似度' },
        prompt_text: { type: 'string', description: '示例音频里说的内容' },
      },
      required: ['audio_path', 'name'],
    },
    output: {
      schema: VOICE_OUTPUT,
      render: (_args, value) => [
        {
          type: 'text',
          text: [
            `已复刻音色「${value.name}」`,
            `voice_id: ${value.voice_id}`,
            `试听: ${value.preview_path}`,
            value.duration_ms ? `试听时长: ${(value.duration_ms / 1000).toFixed(1)} 秒` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
    },
    async execute(args, exec) {
      const result = await voice.api.clone({
        audioPath: args.audio_path,
        name: args.name,
        model: args.model,
        previewText: args.preview_text,
        promptAudioPath: args.prompt_audio_path,
        promptText: args.prompt_text,
        exec,
        signal: exec.signal,
      })
      return {
        voice_id: result.voiceId,
        name: result.name,
        model: result.model,
        preview_path: result.previewPath || '',
        duration_ms: result.durationMs ?? 0,
      }
    },
  }
}

function listTool(voice) {
  return {
    name: 'minimax_voice_list',
    description: '列出已复刻并持久保存的音色（voice_id、名称、模型、试听文件路径），用于挑一个给文本转音频用。',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'number', description: '音色数量' },
          voices: {
            type: 'array',
            description: '音色清单',
            items: {
              type: 'object',
              properties: {
                voice_id: { type: 'string' },
                name: { type: 'string' },
                model: { type: 'string' },
                created_at: { type: 'string' },
                preview_path: { type: 'string' },
              },
              required: ['voice_id', 'name', 'model'],
            },
          },
        },
        required: ['count', 'voices'],
      },
      render: (_args, value) => {
        if (!value.count) return text('音色库还是空的：先用 minimax_voice_clone 复刻一个。')
        const lines = value.voices.map(
          (item) => `· ${item.name}  ${item.voice_id}  (${item.model})${item.preview_path ? `\n  试听: ${item.preview_path}` : ''}`,
        )
        return text(`共 ${value.count} 个音色：\n${lines.join('\n')}`)
      },
    },
    async execute() {
      const voices = await voice.api.list()
      return {
        count: voices.length,
        voices: voices.map((item) => ({
          voice_id: item.voiceId,
          name: item.name,
          model: item.model,
          created_at: item.createdAt,
          preview_path: item.previewPath || '',
        })),
      }
    },
  }
}

function ttsTool(voice) {
  return {
    name: 'minimax_tts',
    description:
      '用指定音色把文本合成为 mp3（单次上限 10000 字符，超过 3000 字符建议分段）。不传 voice_id 时使用音色库里最新复刻的音色；也可以直接传 MiniMax 系统音色 ID。返回音频的本地路径。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: '要合成的文本' },
        voice_id: { type: 'string', description: '音色 ID；省略则用音色库里最新的一个' },
        out_path: { type: 'string', description: '输出文件路径；省略则写到插件输出目录并返回路径' },
        model: { type: 'string', enum: TTS_MODELS, description: `合成模型，默认 ${DEFAULT_MODEL}` },
        speed: { type: 'number', description: '语速 0.5–2，默认 1' },
        vol: { type: 'number', description: '音量 0.01–10，默认 1' },
        pitch: { type: 'number', description: '语调 -12–12，默认 0' },
        emotion: { type: 'string', enum: EMOTIONS, description: '情绪，可选' },
      },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: '生成的音频文件路径' },
          voice_id: { type: 'string', description: '实际使用的音色' },
          duration_ms: { type: 'number', description: '音频时长（毫秒）' },
          characters: { type: 'number', description: '计费字符数' },
          bytes: { type: 'number', description: '文件字节数' },
        },
        required: ['path', 'voice_id'],
      },
      render: (_args, value) =>
        text(
          [
            `已生成音频: ${value.path}`,
            `音色: ${value.voice_id}`,
            value.duration_ms ? `时长: ${(value.duration_ms / 1000).toFixed(1)} 秒` : '',
            value.characters ? `计费字符: ${value.characters}` : '',
          ].filter(Boolean).join('\n'),
        ),
    },
    async execute(args, exec) {
      const result = await voice.api.synthesize({
        text: args.text,
        voiceId: args.voice_id,
        outPath: args.out_path,
        model: args.model,
        speed: args.speed,
        vol: args.vol,
        pitch: args.pitch,
        emotion: args.emotion,
        exec,
        signal: exec.signal,
      })
      return {
        path: result.path,
        voice_id: result.voiceId,
        duration_ms: result.durationMs ?? 0,
        characters: result.characters ?? 0,
        bytes: result.bytes,
      }
    },
  }
}

/* ------------------------------------------------------------------- apply */

export function apply(ctx, config = {}) {
  const voice = createVoice(ctx, config)

  ctx.provide('minimaxVoice', voice.api)

  for (const tool of [cloneTool(voice), listTool(voice), ttsTool(voice)]) {
    ctx.effect(() => ctx.tools.register(tool), `minimax-voice: tool ${tool.name}`)
  }

  let routeRegistered = false
  const claimRoute = (webServer) => {
    if (routeRegistered || !webServer) return
    routeRegistered = true
    ctx.effect(
      () => webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: (req, res) => void voice.handleHttp(req, res) }),
      'minimax-voice: http route',
    )
  }

  claimRoute(ctx.get('webServer'))
  if (!routeRegistered) {
    ctx.on('internal/service', (serviceName, value) => {
      if (serviceName === 'webServer' && value) claimRoute(value)
    })
  }

  try {
    ctx.logger.info('minimax-voice ready: minimaxVoice service, 3 tools, data at %s', voice.dataDir)
  } catch {
    /* logger unavailable in this composition */
  }
}
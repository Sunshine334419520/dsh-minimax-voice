# MiniMax 音色（@local/dsh-minimax-voice）

DeepSeek Harness 的音色复刻 + 文本转音频 + 语音转文字能力。一个 bundle，三种使用面，同一个内核：

| 使用面 | 谁用 | 入口 |
|---|---|---|
| Cordis 服务 `minimaxVoice` | 其他插件（进程内） | `ctx.minimaxVoice` |
| 四个 Agent 工具 | 模型 | `minimax_voice_clone` / `minimax_voice_list` / `minimax_tts` / `minimax_transcribe` |
| 本地 HTTP | Web 面板 | `/mmvoice/api/*` |

设置 → **MiniMax 音色** 里有完整面板：填 API Key、选样本复刻、试听、复制 `voice_id`、文本转音频、音频转文字。

## 给后续插件用的服务契约

```js
export const inject = ['minimaxVoice']

export function apply(ctx) {
  // 软依赖写法：const mm = ctx.get('minimaxVoice'); if (!mm) return
  ctx.tools.register({
    name: 'audiobook_render',
    /* ... */
    async execute(args) {
      const { path } = await ctx.minimaxVoice.synthesize({
        voiceId: args.voiceId,
        text: args.paragraph,
        model: 'speech-2.8-hd',
      })
      return { path }
    },
  })
}
```

契约（**只增不改**）：

```ts
status(): Promise<{ configured, keySource, dataDir, defaultModel, voiceCount }>

list(): Promise<Voice[]>
get(voiceId: string): Promise<Voice | null>
remove(voiceId: string): Promise<boolean>
audio(voiceId: string): Promise<{ bytes: Buffer; path: string; mime: string } | null>

clone(request: {
  audioPath?: string          // 与 bytes 二选一
  bytes?: Buffer
  filename?: string
  name: string                // 音色名，参与生成 voice_id
  model?: string              // 默认 speech-2.8-hd
  previewText?: string        // 试听文本（走接口返回的 demo_audio，不计入首次合成）
  needNoiseReduction?: boolean // 样本降噪，默认 true
  promptAudioPath?: string    // 可选：示例音频（<8s）
  promptText?: string
  signal?: AbortSignal
  exec?: ToolRunContext       // 用来解析相对路径
}): Promise<Voice>

synthesize(request: {
  text: string                // ≤10000 字符
  voiceId?: string            // 省略则用音色库最新一个；也可传系统音色 ID
  outPath?: string            // 省略则写到插件 output 目录
  model?: string
  speed?: number              // 0.5–2
  vol?: number                // 0.01–10
  pitch?: number              // -12–12
  emotion?: string            // happy|sad|angry|fearful|disgusted|surprised|calm|fluent|whisper
  format?: string             // mp3|wav|flac|pcm...
  signal?: AbortSignal
  exec?: ToolRunContext
}): Promise<{ path, bytes, durationMs, characters, voiceId, model, traceId }>

transcribe(request: {
  audioPath?: string          // 与 bytes 二选一
  bytes?: Buffer
  filename?: string
  language?: string           // 省略则自动识别，支持中英混说
  outPath?: string            // 省略则只返回文本
  signal?: AbortSignal
  exec?: ToolRunContext
}): Promise<{ text, durationMs, traceId, path? }>

setApiKey(key: string): Promise<{ configured: true }>
remoteVoices(): Promise<Array<{ voiceId, createdAt, description }>>
```

`Voice` 形状：

```ts
{ voiceId, name, model, createdAt, durationMs, previewPath, sampleName, activated }

// activated=false 表示音色还没被真正合成过：本地能试听，但 MiniMax 侧 9.9 元/音色的
// 复刻费尚未产生，要等第一次 synthesize() 才计入。
```

## 数据落盘

默认在 `$DSH_PROFILE_DIR/minimax-voice/`（无 profile 时 `~/.dsh/minimax-voice/`），可用 `config.dataDir` 覆盖：

```
voices.json        音色注册表（本地为准）
secret.json        面板里保存的 API Key
audio/<id>.<ext>   复刻试听音频（来自 /v1/voice_clone 返回的 demo_audio）
output/*.mp3       文本转音频的产物
```

远端 `/v1/get_voice` 只用来对账：**复刻出来的音色要成功合成过一次才算"激活"**，所以本地注册表是主数据。

### 试听为什么不再花 9.9

MiniMax 的音色复刻费不在 `/v1/voice_clone` 上收，而是在**第一次用该 `voice_id` 调用 T2A 合成**时收（9.9 元/音色）。早期版本为了试听额外调了一次 `/v1/t2a_v2`，于是复刻完立刻扣费。

现在改成直接使用 `/v1/voice_clone` 响应里的 `demo_audio`（接口自带的试听音频，只按 T2A 字符计费，官方确认不计入首次合成）：下载到本地作为试听文件，音色标记 `activated: false`，**9.9 元推迟到用户第一次真正合成时才产生**。面板上这类音色会显示 `· 未激活` 角标。

### 语音转文字

`POST https://api.minimax.cn/v1/speech_to_text`，`model=asr-1.0`，multipart 上传，单次 ≤500 秒、≤50MB，格式 mp3 / aac / opus / wav / m4a。插件只取 `response_format=json` 的纯文本结果，`language` 省略时自动识别。

## 配置

```yaml
- insert:
    - id: minimax-voice
      name: '@local/dsh-minimax-voice'
      config:
        model: speech-2.8-hd     # 默认模型
        dataDir: ''              # 数据目录，留空用 profile 目录
        apiKey: ''               # 不建议写这里，优先环境变量或面板
```

API Key 解析顺序：`config.apiKey` → `MINIMAX_API_KEY` → `secret.json`（面板保存）。

## 注意

- 复刻样本：mp3 / m4a / wav，10 秒–5 分钟，≤20MB；示例音频 <8 秒。
- 语音转文字：单次 ≤500 秒、≤50MB；ASR 与 TTS/复刻分开计费，需在账号侧开通。
- 文本单次 ≤10000 字符，>3000 建议分段。
- `remove()` 只删本地注册表与试听文件，不会删除 MiniMax 账号侧的音色。
- 面板文案目前为中文；插件元数据提供中英两份（`locale/zh.json`、`locale/en.json`）。

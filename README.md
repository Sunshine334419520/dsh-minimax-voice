# MiniMax 音色（@local/dsh-minimax-voice）

DeepSeek Harness 的音色复刻 + 文本转音频能力。一个 bundle，三种使用面，同一个内核：

| 使用面 | 谁用 | 入口 |
|---|---|---|
| Cordis 服务 `minimaxVoice` | 其他插件（进程内） | `ctx.minimaxVoice` |
| 三个 Agent 工具 | 模型 | `minimax_voice_clone` / `minimax_voice_list` / `minimax_tts` |
| 本地 HTTP | Web 面板 | `/mmvoice/api/*` |

设置 → **MiniMax 音色** 里有完整面板：填 API Key、选样本复刻、试听、复制 `voice_id`、文本转音频。

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
  previewText?: string        // 试听文本
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

setApiKey(key: string): Promise<{ configured: true }>
remoteVoices(): Promise<Array<{ voiceId, createdAt, description }>>
```

`Voice` 形状：

```ts
{ voiceId, name, model, createdAt, durationMs, previewPath, sampleName }
```

## 数据落盘

默认在 `$DSH_PROFILE_DIR/minimax-voice/`（无 profile 时 `~/.dsh/minimax-voice/`），可用 `config.dataDir` 覆盖：

```
voices.json        音色注册表（本地为准）
secret.json        面板里保存的 API Key
audio/<id>.mp3     复刻后自动生成的试听音频
output/*.mp3       文本转音频的产物
```

远端 `/v1/get_voice` 只用来对账：**复刻出来的音色要成功合成过一次才算"激活"**，所以本地注册表是主数据，克隆时那次试听合成也顺便完成了激活。

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
- 文本单次 ≤10000 字符，>3000 建议分段。
- `remove()` 只删本地注册表与试听文件，不会删除 MiniMax 账号侧的音色。
- 面板文案目前为中文；插件元数据提供中英两份（`locale/zh.json`、`locale/en.json`）。

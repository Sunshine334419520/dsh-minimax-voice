<p align="center">
  <img src="icon.svg" width="88" height="88" alt="dsh-minimax-voice">
</p>

<h1 align="center">dsh-minimax-voice</h1>

<p align="center"><b>给 DeepSeek Harness 用的 MiniMax 音色复刻、文本转音频、语音转文字插件。</b></p>

<div align="center">

[English](README.md) · [特性](#特性) · [安装](#安装) · [使用](#使用) · [工具](#agent-工具) · [HTTP 接口](#http-接口) · [计费](#计费) · [MIT](LICENSE)

[![npm](https://img.shields.io/npm/v/dsh-minimax-voice.svg?label=npm)](https://www.npmjs.com/package/dsh-minimax-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-0f766e.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

> 这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区插件，不是 DeepSeek 或 MiniMax 官方产品。需要 MiniMax 账号，并开通音色复刻、T2A 合成（语音转文字为可选）。

用 10 秒样本复刻一个音色，**不花那 9.9 元/音色的复刻费也能先听到效果**，然后这个 `voice_id` 可以给 Agent 用、在设置面板里用，也可以被你自己写的插件调用。反过来，音频也能转成文字。

## 特性

- **音色复刻** —— mp3 / m4a / wav，10 秒–5 分钟，≤20MB；可选一段 <8 秒的示例音频提升相似度。
- **试听不花钱，费用后置** —— 试听直接用 `/v1/voice_clone` 返回的 `demo_audio`，只按 T2A 字符计费，不会触发 9.9 元/音色的复刻费；这笔钱推迟到你第一次真正用该音色合成时才产生。见 [计费](#计费)。
- **降噪开关** —— 复刻前过滤样本底噪，默认开启（MiniMax 接口自身默认是关闭的）。
- **文本转音频** —— 单次 10000 字符，8 种情绪，语速 / 音量 / 语调可调，支持 MiniMax 系统音色与自己的复刻音色。
- **语音转文字** —— `asr-1.0`，单次 ≤500 秒 / ≤50MB，自动识别语种，支持中英混说，只返回纯文本。
- **四个 Agent 工具** —— 模型自己就能复刻、查列表、合成、转写。
- **设置面板** —— API Key 管理、带试听播放器的复刻表单、TTS 表单、ASR 卡片、可删除的音色库。
- **只在本机跑** —— 数据在 `~/.dsh/minimax-voice/`，HTTP 服务绑定 localhost，仅 Harness 界面可达。

## 为什么试听是免费的

MiniMax 的音色复刻费**不在** `/v1/voice_clone` 上收，而是在**第一次用该 `voice_id` 调用 T2A 合成**时收（9.9 元/音色）。所以「先复刻、再合成一段试听」的实现会立刻把费用打进去。

本插件改成读取复刻响应里自带的 `demo_audio`（接口自己渲染的试听音频），下载到本地播放。音色以 `activated: false` 入库，面板显示 `· 未激活`；第一次真正调用 `synthesize()` 时才置为 `true`，那也正是 MiniMax 开始计 9.9 元的时刻。

## 环境要求

- DeepSeek Harness `>=0.2.0`（含 Web UI 的 Web 版或桌面版）。
- Node.js 22+。
- MiniMax API Key，且账号已开通 T2A 与音色复刻；语音转文字为可选项，单独计费。
- 能访问 `api.minimax.chat`（国际站）或 `api.minimax.cn`（国内站）。

## 安装

### 让 Agent 帮你装

把下面这段发给任何能执行终端命令的 Agent，把 `desktop` 换成你的 profile 名（`dsh profiles` 可列出）：

```text
把 DSH 插件 dsh-minimax-voice 装进我的 desktop profile：
dsh plugin --profile desktop add dsh-minimax-voice --registry=https://registry.npmjs.org/
装完请访问 GET http://127.0.0.1:58500/mmvoice/api/status 确认已加载，
并告诉我 MiniMax API Key 应该填在哪里。
```

### 从 npm 安装

```bash
dsh plugin --profile desktop add dsh-minimax-voice --registry=https://registry.npmjs.org/
```

### 从源码安装

```bash
git clone https://github.com/Sunshine334419520/dsh-minimax-voice.git
dsh plugin --profile desktop add /绝对路径/dsh-minimax-voice
```

### 重载

桌面版一般会自动加载。如果设置页里没有出现 **MiniMax 音色**，在「插件」里把它关掉再打开，或重启应用。仅刷新浏览器对宿主代码无效，但面板改动需要刷新页面。

### 配置

打开 **设置 → MiniMax 音色**，填入 API Key 保存即可，会写到 `~/.dsh/minimax-voice/secret.json`。也可以用环境变量 `MINIMAX_API_KEY` 或插件配置里的 `config.apiKey`，优先级为 `config.apiKey` → `MINIMAX_API_KEY` → `secret.json`。

自检：

```bash
curl -s http://127.0.0.1:58500/mmvoice/api/status
# {"configured":true,"keySource":"file","dataDir":"/Users/you/.dsh/minimax-voice",
#  "defaultModel":"speech-2.8-hd","voiceCount":3,"previewMode":"demo_audio"}
```

## 使用

### 设置面板

**复刻新音色** —— 选一段样本，可改名，保持降噪开启，点「复刻」。音色会出现在列表里，带 `▶ 试听` 播放器和 `· 未激活` 角标，直到你用它合成过一次。

**文本转音频** —— 粘贴文本（≤10000 字符），选音色，调语速 / 音量 / 语调 / 情绪，合成。mp3 落在 `~/.dsh/minimax-voice/output/`，返回值里有路径。

**音频转文字** —— 选文件，可填语种（`zh`、`en`…），点「开始转写」。结果出现在只读文本框里并可一键复制；用工具调用时还能直接写进 `out_path`。

### Agent 工具

| 工具 | 作用 |
| --- | --- |
| `minimax_voice_clone` | 从 `audio_path` 复刻，返回 `voice_id` 和本地试听路径 |
| `minimax_voice_list` | 列出已保存音色（`voice_id`、名称、模型、试听路径） |
| `minimax_tts` | 用 `voice_id` 合成 `text`（不传则用最新复刻的音色） |
| `minimax_transcribe` | 把 `audio_path` 转成纯文本，可选写到 `out_path` |

```jsonc
// minimax_voice_clone
{ "audio_path": "~/samples/narrator.m4a", "name": "悬疑旁白", "need_noise_reduction": true }

// minimax_tts
{ "text": "第一章，雨夜。", "voice_id": "mvabc123", "model": "speech-2.8-hd",
  "speed": 1.1, "emotion": "calm", "out_path": "~/out/ch1.mp3" }

// minimax_transcribe
{ "audio_path": "~/out/ch1.mp3", "language": "zh", "out_path": "~/out/ch1.txt" }
```

### HTTP 接口

所有路由都在 Harness Web 服务的 `/mmvoice/api` 下（默认 `http://127.0.0.1:58500`），无鉴权，实际上只有本机能访问。

| 方法 | 路由 | 参数 | 返回 |
| --- | --- | --- | --- |
| GET | `/status` | — | `{ configured, keySource, dataDir, defaultModel, voiceCount, previewMode }` |
| GET | `/voices` | — | `{ voices: Voice[] }` |
| GET | `/voices/:id/audio` | — | 试听 mp3 |
| DELETE | `/voices/:id` | — | `{ removed: true }`（仅本地） |
| POST | `/key` | `{ key }` | `{ configured: true }` |
| POST | `/clone` | multipart 或原始音频，`?name=&model=&previewText=&noiseReduction=1` | `Voice` |
| POST | `/tts` | `{ text, voiceId, model, speed, vol, pitch, emotion }` | `{ path, durationMs, characters, traceId }` |
| POST | `/transcribe` | 原始音频，`?filename=&language=` | `{ text, durationMs, traceId }` |
| GET | `/output/:file` | — | 合成产物 |
| GET | `/remote` | — | `/v1/get_voice` 报回来的账号侧音色 |

```bash
curl -X POST --data-binary @sample.mp3 -H "content-type: audio/mpeg" \
  "http://127.0.0.1:58500/mmvoice/api/transcribe?filename=sample.mp3&language=zh"
```

### Cordis 服务

其他插件可以直接注入服务，不必重写一遍 API：

```js
export const inject = ['minimaxVoice']

export function apply(ctx) {
  ctx.tools.register({
    name: 'audiobook_render',
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

| 方法 | 签名 |
| --- | --- |
| `status()` | `{ configured, keySource, dataDir, defaultModel, voiceCount, previewMode }` |
| `list()` / `get(voiceId)` / `remove(voiceId)` | 音色注册表读写 |
| `audio(voiceId)` | 本地试听音频 `{ bytes, path, mime }` |
| `clone(request)` | `{ audioPath \| bytes, filename, name, model, previewText, needNoiseReduction, promptAudioPath, promptText, signal, exec }` |
| `synthesize(request)` | `{ text, voiceId, outPath, model, speed, vol, pitch, emotion, format, signal, exec }` |
| `transcribe(request)` | `{ audioPath \| bytes, filename, language, outPath, signal, exec }` |
| `setApiKey(key)` | 写入 `secret.json` |
| `remoteVoices()` | MiniMax 账号侧音色列表 |

`Voice`：

```ts
{ voiceId, name, model, createdAt, durationMs, previewPath, sampleName, activated }
```

`activated === false` 表示音色已存在、能试听，但从未合成过：MiniMax 还没有收那 9.9 元。

## 计费

| 项目 | 什么时候扣 |
| --- | --- |
| 音色复刻 9.9 元/音色 | 用新 `voice_id` **第一次合成**时，而不是复刻时 |
| 试听音频 | 只按 T2A 字符计费（默认那句话不到一分钱） |
| 文本转音频 | 按 TTS 字符计费，取决于模型（`speech-2.8-hd` / `-turbo` 等） |
| 语音转文字 | 按 ASR 用量单独计费，与 TTS 分开 |

具体单价见 [MiniMax 定价](https://www.minimax.io/price)。每次合成面板都会返回 `characters`，方便对账。

## 数据与隐私

```
~/.dsh/minimax-voice/
├── voices.json          音色注册表（以此为准）
├── secret.json          API Key，明文
├── audio/<id>.mp3       复刻试听音频
└── output/*.mp3         合成产物
```

- `secret.json` 是**明文**存的。注意文件权限，或者改用 `MINIMAX_API_KEY` 环境变量。
- 音频和文本会发给 MiniMax 完成处理，其余数据不出本机。
- `remove()` 只删本地注册表和试听文件；要连账号侧一起删，请去 MiniMax 控制台。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `configured: false` | 没找到 Key，去面板保存或导出 `MINIMAX_API_KEY` |
| 装完设置页没出现 | 在「插件」里关掉再打开，或重启应用 |
| `/mmvoice/api/status` 返回 404 | 这个 profile 没加载插件，`dsh plugin --profile <name> list` 看看 |
| 新音色显示 `未激活` | 正常。还没合成过，所以那 9.9 元也没收 |
| 复刻报 400 | 样本太短 / 太长 / 太安静，或账号没开通复刻权限 |
| 转写结果为空 | 语种提示与音频不符，或者文件基本是纯音乐 |

## 开发

```bash
git clone https://github.com/Sunshine334419520/dsh-minimax-voice.git
dsh plugin --profile desktop add "$PWD"
```

宿主侧是纯 ESM（`index.js`），面板是 Cordis 客户端 bundle（`client.js`），无构建步骤、无运行时依赖。改完代码后在「插件」里关掉再打开即可重载，面板改动还需刷新页面。

## 许可证

[MIT](LICENSE) © 2026 Sunshine334419520

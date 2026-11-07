<p align="center">
  <img src="icon.svg" width="88" height="88" alt="dsh-minimax-voice">
</p>

<h1 align="center">dsh-minimax-voice</h1>

<p align="center"><b>Voice cloning, text-to-speech and speech-to-text for DeepSeek Harness, powered by MiniMax.</b></p>

<div align="center">

[简体中文](README.zh-CN.md) · [Features](#features) · [Install](#installation) · [Usage](#usage) · [Tools](#agent-tools) · [HTTP API](#http-api) · [Billing](#billing) · [MIT](LICENSE)

[![npm](https://img.shields.io/npm/v/dsh-minimax-voice.svg?label=npm)](https://www.npmjs.com/package/dsh-minimax-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/Sunshine334419520/dsh-minimax-voice/)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-0f766e.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

> A community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Not an official DeepSeek or MiniMax product. A MiniMax account with voice cloning, TTS and (optionally) speech recognition enabled is required.

Clone a voice from a 10-second sample, hear the result **without paying the ¥9.9-per-voice cloning fee**, then use that `voice_id` from the Agent, from the settings panel, or from your own plugin. Audio can also be transcribed back into text.

## Features

- **Voice cloning** — mp3 / m4a / wav, 10 s–5 min, ≤20 MB. Optional second sample (<8 s) improves similarity.
- **Free preview, deferred billing** — the preview comes from the `demo_audio` returned by `/v1/voice_clone`, billed as TTS characters only. The ¥9.9 per-voice cloning fee is not triggered; it is charged when you first synthesize with the voice. See [Billing](#billing).
- **Noise reduction toggle** — strip sample hiss before cloning (on by default; MiniMax's own default is off).
- **Text-to-speech** — 10 000 characters per call, eight emotions, speed / volume / pitch control, MiniMax system voices or your own clones.
- **Speech-to-text** — `asr-1.0`, ≤500 s / ≤50 MB per call, automatic language detection, mixed Chinese-English handled, returns plain text.
- **Four Agent tools** — the model can clone, list, synthesize and transcribe on its own.
- **Settings panel** — key management, cloning form with live preview player, TTS form, ASR card, voice library with delete.
- **Local only** — settings live in `~/.dsh/minimax-voice/`, the HTTP service binds to localhost and is only reachable from the Harness UI.

## Why the preview is free

MiniMax charges voice cloning **not** when `/v1/voice_clone` is called, but on the **first T2A synthesis** using that `voice_id` (¥9.9 per voice). A preview implemented as "clone, then call T2A to hear it" therefore burns the fee immediately.

This plugin instead reads `demo_audio` from the clone response — the sample the API itself renders — downloads it locally and plays that. The voice is stored with `activated: false` and marked `· 未激活` in the panel. `activated` flips to `true` on the first real `synthesize()`, which is also when MiniMax starts counting the ¥9.9.

## Requirements

- DeepSeek Harness `>=0.2.0` (Web or desktop build that includes the Web UI).
- Node.js 22+.
- A MiniMax API key with T2A and voice cloning enabled. Speech recognition is optional and billed separately.
- Network access to `api.minimax.chat` (international) or `api.minimax.cn` (China).

## Installation

### Ask an agent

Send this to any agent that can run terminal commands. Replace `desktop` with your profile name (`dsh profiles` lists them):

```text
Install the DSH plugin dsh-minimax-voice into my desktop profile:
dsh plugin --profile desktop add dsh-minimax-voice --registry=https://registry.npmjs.org/
Then confirm it loaded by checking that GET http://127.0.0.1:58500/mmvoice/api/status responds,
and tell me where to paste my MiniMax API key.
```

### Install from npm

```bash
dsh plugin --profile desktop add dsh-minimax-voice --registry=https://registry.npmjs.org/
```

### Install from source

```bash
git clone https://github.com/Sunshine334419520/dsh-minimax-voice.git
dsh plugin --profile desktop add /absolute/path/to/dsh-minimax-voice
```

### Reload

Desktop apps usually pick the new plugin up on their own. If the settings page does not show **MiniMax Voice**, toggle the plugin off and on in **Plugins**, or restart the app. A browser refresh alone is not enough for host-side code, but is needed for panel changes.

### Configure

Open **Settings → MiniMax Voice**, paste your API key and save. The key is written to `~/.dsh/minimax-voice/secret.json`. You can also set `MINIMAX_API_KEY` in the environment or `config.apiKey` in the plugin config; precedence is `config.apiKey` → `MINIMAX_API_KEY` → `secret.json`.

Verify:

```bash
curl -s http://127.0.0.1:58500/mmvoice/api/status
# {"configured":true,"keySource":"file","dataDir":"/Users/you/.dsh/minimax-voice",
#  "defaultModel":"speech-2.8-hd","voiceCount":3,"previewMode":"demo_audio"}
```

## Usage

### Settings panel

**Clone a voice** — pick a sample, optionally rename the voice, keep noise reduction on, press 复刻. The card appears in the library with a `▶ 试听` player and a `· 未激活` badge until you synthesize with it.

**Text to audio** — paste text (≤10 000 characters), pick a voice, adjust speed / volume / pitch / emotion, synthesize. The mp3 is written to `~/.dsh/minimax-voice/output/` and the response says where.

**Audio to text** — pick a file, optionally name the language (`zh`, `en`, …), press 开始转写. The transcript lands in a read-only box with a copy button, and in `out_path` if you used the tool.

### Agent tools

| Tool | What it does |
| --- | --- |
| `minimax_voice_clone` | Clone from `audio_path`; returns `voice_id` plus a local preview path |
| `minimax_voice_list` | List saved voices with `voice_id`, name, model, preview path |
| `minimax_tts` | Synthesize `text` with `voice_id` (defaults to the newest clone) |
| `minimax_transcribe` | Transcribe `audio_path` to plain text, optionally write `out_path` |

```jsonc
// minimax_voice_clone
{ "audio_path": "~/samples/narrator.m4a", "name": "悬疑旁白", "need_noise_reduction": true }

// minimax_tts
{ "text": "第一章，雨夜。", "voice_id": "mvabc123", "model": "speech-2.8-hd",
  "speed": 1.1, "emotion": "calm", "out_path": "~/out/ch1.mp3" }

// minimax_transcribe
{ "audio_path": "~/out/ch1.mp3", "language": "zh", "out_path": "~/out/ch1.txt" }
```

### HTTP API

All routes live under `/mmvoice/api` on the Harness web server (`http://127.0.0.1:58500` by default), are unauthenticated, and are only meaningfully reachable from localhost.

| Method | Route | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/status` | — | `{ configured, keySource, dataDir, defaultModel, voiceCount, previewMode }` |
| GET | `/voices` | — | `{ voices: Voice[] }` |
| GET | `/voices/:id/audio` | — | preview mp3 |
| DELETE | `/voices/:id` | — | `{ removed: true }` (local only) |
| POST | `/key` | `{ key }` | `{ configured: true }` |
| POST | `/clone` | multipart or raw audio, `?name=&model=&previewText=&noiseReduction=1` | `Voice` |
| POST | `/tts` | `{ text, voiceId, model, speed, vol, pitch, emotion }` | `{ path, durationMs, characters, traceId }` |
| POST | `/transcribe` | raw audio, `?filename=&language=` | `{ text, durationMs, traceId }` |
| GET | `/output/:file` | — | generated audio |
| GET | `/remote` | — | voices reported by `/v1/get_voice` |

```bash
curl -X POST --data-binary @sample.mp3 -H "content-type: audio/mpeg" \
  "http://127.0.0.1:58500/mmvoice/api/transcribe?filename=sample.mp3&language=zh"
```

### Cordis service

Other plugins can inject the service instead of re-implementing the API:

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

| Method | Signature |
| --- | --- |
| `status()` | `{ configured, keySource, dataDir, defaultModel, voiceCount, previewMode }` |
| `list()` / `get(voiceId)` / `remove(voiceId)` | voice registry access |
| `audio(voiceId)` | `{ bytes, path, mime }` for the local preview |
| `clone(request)` | `{ audioPath \| bytes, filename, name, model, previewText, needNoiseReduction, promptAudioPath, promptText, signal, exec }` |
| `synthesize(request)` | `{ text, voiceId, outPath, model, speed, vol, pitch, emotion, format, signal, exec }` |
| `transcribe(request)` | `{ audioPath \| bytes, filename, language, outPath, signal, exec }` |
| `setApiKey(key)` | persists the key to `secret.json` |
| `remoteVoices()` | account-side voice list from MiniMax |

`Voice`:

```ts
{ voiceId, name, model, createdAt, durationMs, previewPath, sampleName, activated }
```

`activated === false` means the voice exists locally and can be previewed, but has never been synthesized: MiniMax has not yet charged the ¥9.9 cloning fee.

## Billing

| Item | When it is charged |
| --- | --- |
| Voice cloning ¥9.9 / voice | On the **first synthesis** with the new `voice_id`, not at clone time |
| Preview audio | TTS characters only (the default sentence is a fraction of a cent) |
| Text to speech | Per TTS character, depending on model (`speech-2.8-hd` / `-turbo`, …) |
| Speech to text | Per ASR usage, billed separately from TTS |

Check [MiniMax pricing](https://www.minimax.io/price) for current numbers. The panel shows `characters` for every synthesis so you can track spend.

## Data and privacy

```
~/.dsh/minimax-voice/
├── voices.json          voice registry (source of truth)
├── secret.json          API key, plain text
├── audio/<id>.mp3       clone previews
└── output/*.mp3         synthesized audio
```

- `secret.json` is **plain text**. Protect the file, or supply the key through `MINIMAX_API_KEY` instead.
- Audio and text are sent to MiniMax to do the work; nothing else leaves the machine.
- `remove()` deletes the local registry entry and preview only. Delete on MiniMax's side from the console if you also want the voice gone there.

## Local API security

`/mmvoice/api` can read the API key, write audio files and trigger billed calls, so every request passes the harness trust fence: [`connection.requestRejection()`](https://github.com/deepseek-ai/deepseek-harness) checks the Host/Origin pair (DNS rebinding) and requires an authenticated browser session or API token. A request that fails is answered with `401` or `403`. If the `connection` service is unavailable, only loopback, same-origin requests are accepted. Another website therefore cannot reach these routes to spend your MiniMax balance or swap the key.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `configured: false` | No key found; save one in the panel or export `MINIMAX_API_KEY` |
| Panel missing after install | Toggle the plugin off/on in **Plugins**, or restart the app |
| `mmvoice/api/status` returns 404 | Plugin is not loaded in this profile — check `dsh plugin --profile <name> list` |
| `mmvoice/api/*` returns 401 | No authenticated session for that request; open the panel from the harness UI (the routes are not open to other origins) |
| New voice shows `未激活` | Expected. It is never been synthesized yet, so the fee is not paid |
| Clone fails with 400 | Sample too short/long/quiet, or the account has no voice-cloning permission |
| Transcription returns empty text | Language hint conflicts with the audio, or the file is mostly music |

## Development

```bash
git clone https://github.com/Sunshine334419520/dsh-minimax-voice.git
dsh plugin --profile desktop add "$PWD"
```

Host code is plain ESM (`index.js`), the panel is a Cordis client bundle (`client.js`). No build step, no runtime dependencies. After editing, reload the plugin: disable and re-enable it in **Plugins**, then refresh the page for panel changes.

## License

[MIT](LICENSE) © 2026 Sunshine334419520

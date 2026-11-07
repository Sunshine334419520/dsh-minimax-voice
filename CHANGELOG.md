# Changelog

## 0.2.0 — 2026-11-07

### Added

- **Speech-to-text** — `minimax_transcribe` tool, `minimaxVoice.transcribe()`, `POST /mmvoice/api/transcribe`, and an ASR card in the settings panel. `asr-1.0`, ≤500 s / ≤50 MB, automatic language detection, plain-text output.
- **Noise reduction toggle** — `need_noise_reduction` on clone requests (panel checkbox, `?noiseReduction=` query, tool parameter). Defaults to on.
- **`activated` on `Voice`** — `false` until the first real synthesis, so the panel can mark voices whose ¥9.9 cloning fee has not been charged yet.
- Bilingual documentation — `README.md` and `README.zh-CN.md`.
- Published to npm as `dsh-minimax-voice` (was the private `@local/dsh-minimax-voice`).

### Changed

- **Clone preview no longer triggers the ¥9.9 cloning fee.** The preview now comes from the `demo_audio` field of the `/v1/voice_clone` response instead of an extra `/v1/t2a_v2` call, and is billed as TTS characters only.
- Version metadata bumped to 0.2.0; MIT license, repository and keywords added for npm.

## 0.1.0 — 2026-11-07

### Added

- Initial release: `minimaxVoice` Cordis service, `minimax_voice_clone` / `minimax_voice_list` / `minimax_tts` tools, local HTTP API under `/mmvoice/api`, and the DeepSeek Harness settings panel with voice library and TTS form.

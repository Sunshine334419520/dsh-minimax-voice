/**
 * MiniMax 音色面板（Client 半边）。
 * 渲染在 设置 → MiniMax 音色：配置 API Key、复刻音色、试听、复制 voice_id、文本转音频。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-minimax-voice',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const API = '/mmvoice/api'
    const FONT = 'inherit'

    const tone = {
      label: 'var(--dsw-alias-label-primary)',
      label2: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      bg1: 'var(--dsw-alias-bg-layer-1)',
      bg2: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
    }

    const s = {
      wrap: { padding: '4px 2px 40px', maxWidth: 760, color: tone.label, fontFamily: FONT, fontSize: 13 },
      card: {
        border: `1px solid ${tone.border}`,
        background: tone.bg1,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 14,
      },
      h2: { fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: tone.label },
      hint: { fontSize: 12, color: tone.label2, lineHeight: 1.6, margin: '6px 0 0' },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      input: {
        flex: '1 1 200px',
        minWidth: 160,
        height: 30,
        padding: '0 10px',
        borderRadius: 7,
        border: `1px solid ${tone.border2}`,
        background: tone.bg2,
        color: tone.label,
        fontFamily: FONT,
        fontSize: 13,
        outline: 'none',
      },
      area: {
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 84,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${tone.border2}`,
        background: tone.bg2,
        color: tone.label,
        fontFamily: FONT,
        fontSize: 13,
        resize: 'vertical',
        outline: 'none',
      },
      button: {
        height: 30,
        padding: '0 14px',
        borderRadius: 7,
        border: `1px solid ${tone.border2}`,
        background: tone.bg2,
        color: tone.label,
        fontFamily: FONT,
        fontSize: 13,
        cursor: 'pointer',
      },
      primary: {
        height: 30,
        padding: '0 14px',
        borderRadius: 7,
        border: `1px solid ${tone.brand}`,
        background: tone.brand,
        color: '#fff',
        fontFamily: FONT,
        fontSize: 13,
        cursor: 'pointer',
      },
      link: {
        height: 26,
        padding: '0 8px',
        borderRadius: 6,
        border: `1px solid ${tone.border}`,
        background: 'transparent',
        color: tone.label2,
        fontFamily: FONT,
        fontSize: 12,
        cursor: 'pointer',
      },
      voiceRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderTop: `1px solid ${tone.border}`,
      },
      name: { fontSize: 13, fontWeight: 600, marginBottom: 3 },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        color: tone.label2,
        background: tone.bg2,
        border: `1px solid ${tone.border}`,
        borderRadius: 5,
        padding: '1px 6px',
        wordBreak: 'break-all',
      },
      badge: (ok) => ({
        fontSize: 11,
        padding: '1px 8px',
        borderRadius: 999,
        border: `1px solid ${ok ? tone.success : tone.warn}`,
        color: ok ? tone.success : tone.warn,
      }),
      error: { color: tone.error, fontSize: 12, margin: '8px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
      ok: { color: tone.success, fontSize: 12, margin: '8px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
    }

    async function request(path, options) {
      const res = await fetch(API + path, options)
      let data = {}
      try {
        data = await res.json()
      } catch {
        data = {}
      }
      if (!res.ok || (data && data.error)) {
        throw new Error((data && data.error) || `请求失败 HTTP ${res.status}`)
      }
      return data
    }

    function VoiceCard({ voice, disabled, onDelete }) {
      const audioRef = useRef(null)
      const [playing, setPlaying] = useState(false)
      const [copied, setCopied] = useState(false)

      const toggle = () => {
        const node = audioRef.current
        if (!node) return
        if (playing) {
          node.pause()
          node.currentTime = 0
          setPlaying(false)
          return
        }
        node.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      }

      const copy = () => {
        const text = voice.voiceId
        const done = () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done)
        } else {
          done()
        }
      }

      return h(
        'div',
        { style: s.voiceRow },
        h('audio', {
          ref: audioRef,
          src: `${API}/voices/${encodeURIComponent(voice.voiceId)}/audio`,
          preload: 'none',
          onEnded: () => setPlaying(false),
          style: { display: 'none' },
        }),
        h(
          'div',
          { style: { flex: '1 1 auto', minWidth: 0 } },
          h('div', { style: s.name }, voice.name),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { style: s.code }, voice.voiceId),
            h('span', { style: { fontSize: 11, color: tone.label2 } }, voice.model || ''),
            voice.activated === false
              ? h('span', {
                  style: { fontSize: 11, color: tone.label2, opacity: 0.75 },
                  title: '还没用它正式合成过，9.9 元音色费尚未产生',
                }, '· 未激活')
              : null,
          ),
        ),
        h('button', { style: s.link, onClick: toggle, title: '试听' }, playing ? '■ 停止' : '▶ 试听'),
        h('button', { style: s.link, onClick: copy, title: '复制 voice_id' }, copied ? '已复制' : '复制 ID'),
        h('button', {
          style: { ...s.link, color: tone.error },
          disabled,
          onClick: () => onDelete(voice.voiceId),
          title: '从本地音色库移除',
        }, '删除'),
      )
    }

    function Panel() {
      const [status, setStatus] = useState(null)
      const [voices, setVoices] = useState([])
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [loading, setLoading] = useState(true)

      const [keyDraft, setKeyDraft] = useState('')
      const [name, setName] = useState('')
      const [file, setFile] = useState(null)
      const [previewText, setPreviewText] = useState('')
      const [noiseReduction, setNoiseReduction] = useState(true)
      const [cloning, setCloning] = useState(false)

      const [text, setText] = useState('')
      const [voiceId, setVoiceId] = useState('')
      const [synthesizing, setSynthesizing] = useState(false)
      const [result, setResult] = useState(null)

      const [asrFile, setAsrFile] = useState(null)
      const [asrLanguage, setAsrLanguage] = useState('')
      const [asrResult, setAsrResult] = useState(null)
      const [transcribing, setTranscribing] = useState(false)
      const [copiedAsr, setCopiedAsr] = useState(false)

      const refresh = useCallback(async () => {
        setError('')
        try {
          const info = await request('/status')
          const list = await request('/voices')
          setStatus(info)
          const items = Array.isArray(list.voices) ? list.voices : []
          setVoices(items)
          setVoiceId((current) => current || (items[0] ? items[0].voiceId : ''))
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        refresh()
      }, [refresh])

      const saveKey = async () => {
        setError('')
        setNotice('')
        try {
          await request('/key', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ apiKey: keyDraft }),
          })
          setKeyDraft('')
          setNotice('API Key 已保存。')
          await refresh()
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        }
      }

      const clone = async () => {
        setError('')
        setNotice('')
        if (!file) {
          setError('先选择一个音频文件（mp3 / m4a / wav，10 秒–5 分钟，≤20MB）。')
          return
        }
        setCloning(true)
        try {
          const buffer = await file.arrayBuffer()
          const query = new URLSearchParams({
            name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
            filename: file.name,
          })
          if (previewText.trim()) query.set('previewText', previewText.trim())
          query.set('noiseReduction', noiseReduction ? '1' : '0')
          const data = await request(`/clone?${query.toString()}`, {
            method: 'POST',
            headers: { 'content-type': file.type || 'application/octet-stream' },
            body: buffer,
          })
          setNotice(`复刻完成：${data.voice.name}（${data.voice.voiceId}）`)
          setName('')
          setFile(null)
          setPreviewText('')
          await refresh()
          setVoiceId(data.voice.voiceId)
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        } finally {
          setCloning(false)
        }
      }

      const synthesize = async () => {
        setError('')
        setNotice('')
        if (!text.trim()) {
          setError('先输入要合成的文本。')
          return
        }
        setSynthesizing(true)
        try {
          const data = await request('/tts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, voiceId }),
          })
          setResult({ ...data, at: Date.now() })
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        } finally {
          setSynthesizing(false)
        }
      }

      const transcribe = async () => {
        setError('')
        setNotice('')
        if (!asrFile) {
          setError('先选择一个音频文件（mp3 / aac / opus / wav / m4a，≤500 秒、≤50MB）。')
          return
        }
        setTranscribing(true)
        try {
          const buffer = await asrFile.arrayBuffer()
          const query = new URLSearchParams({ filename: asrFile.name })
          if (asrLanguage.trim()) query.set('language', asrLanguage.trim())
          const data = await request(`/transcribe?${query.toString()}`, {
            method: 'POST',
            headers: { 'content-type': asrFile.type || 'application/octet-stream' },
            body: buffer,
          })
          setAsrResult({ ...data, name: asrFile.name })
          setAsrFile(null)
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        } finally {
          setTranscribing(false)
        }
      }

      const copyTranscript = () => {
        if (!asrResult) return
        const done = () => {
          setCopiedAsr(true)
          setTimeout(() => setCopiedAsr(false), 1400)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(asrResult.text).then(done, done)
        } else {
          done()
        }
      }

      const removeVoice = async (id) => {
        setError('')
        setNotice('')
        try {
          await request(`/voices/${encodeURIComponent(id)}`, { method: 'DELETE' })
          await refresh()
        } catch (problem) {
          setError(String((problem && problem.message) || problem))
        }
      }

      const configured = Boolean(status && status.configured)

      return h(
        'div',
        { style: s.wrap },
        h(
          'div',
          { style: { ...s.card, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' } },
          h(
            'div',
            null,
            h('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'MiniMax 音色复刻与文本转音频'),
            h('div', { style: { ...s.hint, margin: 0 } },
              loading
                ? '正在读取状态…'
                : configured
                  ? `已连接 · 音色库 ${voices.length} 个 · 默认模型 ${status.defaultModel}`
                  : '还没有配置 API Key，复刻和合成会被拒绝。'),
          ),
          h('span', { style: s.badge(configured) }, configured ? '已配置' : '未配置'),
        ),

        h(
          'div',
          { style: s.card },
          h('div', { style: s.h2 }, 'API Key'),
          h(
            'div',
            { style: s.row },
            h('input', {
              style: s.input,
              type: 'password',
              placeholder: configured ? '已保存，粘贴新的可覆盖' : '粘贴 MiniMax API Key',
              value: keyDraft,
              onChange: (event) => setKeyDraft(event.target.value),
            }),
            h('button', { style: s.primary, onClick: saveKey, disabled: !keyDraft.trim() }, '保存'),
          ),
          h('div', { style: s.hint }, 'Key 保存在插件数据目录，不会写进配置文件；也支持环境变量 MINIMAX_API_KEY。'),
        ),

        h(
          'div',
          { style: s.card },
          h('div', { style: s.h2 }, '复刻新音色'),
          h(
            'div',
            { style: { ...s.row, marginBottom: 8 } },
            h('input', {
              style: s.input,
              placeholder: '音色名称（例如：我的旁白音）',
              value: name,
              onChange: (event) => setName(event.target.value),
            }),
            h('input', {
              type: 'file',
              accept: 'audio/mpeg,audio/wav,audio/mp4,audio/*',
              onChange: (event) => setFile(event.target.files && event.target.files[0] ? event.target.files[0] : null),
              style: { fontSize: 12, color: tone.label2, maxWidth: 240 },
            }),
          ),
          h('input', {
            style: { ...s.input, width: '100%', boxSizing: 'border-box', marginBottom: 10 },
            placeholder: '试听文本（可选，默认一句中文）',
            value: previewText,
            onChange: (event) => setPreviewText(event.target.value),
          }),
          h('label', {
            style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tone.label2, marginBottom: 10, cursor: 'pointer' },
            title: '传给 /v1/voice_clone 的 need_noise_reduction，默认开启',
          },
            h('input', {
              type: 'checkbox',
              checked: noiseReduction,
              onChange: (event) => setNoiseReduction(Boolean(event.target.checked)),
            }),
            '降噪（过滤样本底噪，默认开启）',
          ),
          h('button', { style: s.primary, onClick: clone, disabled: cloning }, cloning ? '复刻中…' : '开始复刻'),
          h('div', { style: s.hint }, '样本要求：mp3 / m4a / wav，10 秒到 5 分钟，不超过 20MB。复刻后试听用的是复刻接口自带的音频，只按字符计费，不会产生 9.9 元音色费；等第一次正式合成该音色时才收。'),
        ),

        h(
          'div',
          { style: s.card },
          h('div', { style: s.h2 }, `音色库（${voices.length}）`),
          voices.length === 0
            ? h('div', { style: { ...s.hint, margin: 0 } }, '还是空的。上传一段样本复刻第一个音色，voice_id 会一直保存在这里。')
            : voices.map((voice) => h(VoiceCard, { key: voice.voiceId, voice, disabled: false, onDelete: removeVoice })),
        ),

        h(
          'div',
          { style: s.card },
          h('div', { style: s.h2 }, '文本转音频'),
          h(
            'div',
            { style: { ...s.row, marginBottom: 8 } },
            h(
              'select',
              {
                style: { ...s.input, flex: '0 1 240px' },
                value: voiceId,
                onChange: (event) => setVoiceId(event.target.value),
              },
              voices.length === 0
                ? h('option', { value: '' }, '（先复刻一个音色）')
                : voices.map((voice) => h('option', { key: voice.voiceId, value: voice.voiceId }, `${voice.name} · ${voice.voiceId}`)),
            ),
          ),
          h('textarea', {
            style: s.area,
            placeholder: '要合成的声音内容…',
            value: text,
            onChange: (event) => setText(event.target.value),
          }),
          h(
            'div',
            { style: { ...s.row, marginTop: 10 } },
            h('button', { style: s.primary, onClick: synthesize, disabled: synthesizing || !voices.length }, synthesizing ? '生成中…' : '生成音频'),
            result
              ? h('a', {
                  href: `${result.url}?t=${result.at}`,
                  download: true,
                  style: { ...s.link, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
                }, '下载 mp3')
              : null,
          ),
          result
            ? h(
                'div',
                { style: { marginTop: 10 } },
                h('audio', { src: `${result.url}?t=${result.at}`, controls: true, style: { width: '100%' } }),
                h('div', { style: { ...s.hint, wordBreak: 'break-all' } },
                  `${(result.durationMs / 1000 || 0).toFixed(1)} 秒 · ${result.characters || 0} 字符 · ${result.path}`),
              )
            : null,
        ),

        h(
          'div',
          { style: s.card },
          h('div', { style: s.h2 }, '音频转文字（ASR）'),
          h(
            'div',
            { style: { ...s.row, marginBottom: 8 } },
            h('input', {
              type: 'file',
              accept: 'audio/*,video/mp4',
              onChange: (event) => setAsrFile(event.target.files && event.target.files[0] ? event.target.files[0] : null),
              style: { fontSize: 12, color: tone.label2, maxWidth: 260 },
            }),
            h('input', {
              style: { ...s.input, flex: '0 0 150px' },
              placeholder: '语种（留空自动）',
              value: asrLanguage,
              onChange: (event) => setAsrLanguage(event.target.value),
            }),
          ),
          h(
            'div',
            { style: s.row },
            h('button', { style: s.primary, onClick: transcribe, disabled: transcribing }, transcribing ? '转写中…' : '开始转写'),
            asrResult ? h('button', { style: s.link, onClick: copyTranscript }, copiedAsr ? '已复制' : '复制结果') : null,
          ),
          asrResult
            ? h(
                'div',
                { style: { marginTop: 10 } },
                h('textarea', { style: { ...s.area, minHeight: 130 }, readOnly: true, value: asrResult.text }),
                h('div', { style: { ...s.hint, wordBreak: 'break-all' } },
                  `${asrResult.name || ''} · ${((asrResult.durationMs || 0) / 1000).toFixed(1)} 秒`),
              )
            : null,
          h('div', { style: s.hint }, '返回纯文本。支持 mp3 / aac / opus / wav / m4a，单次 ≤500 秒、≤50MB；不填语种时自动识别主要语言并处理中英混说。'),
        ),

        notice ? h('div', { style: s.ok }, notice) : null,
        error ? h('div', { style: s.error }, error) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'minimax-voice',
              order: 40,
              label: 'MiniMax 音色',
            },
            Panel,
          ),
        )
      },
    }
  },
})

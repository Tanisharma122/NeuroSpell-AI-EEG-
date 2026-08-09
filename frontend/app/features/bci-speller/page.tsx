'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'

const API = 'http://127.0.0.1:8000'

const GRID: string[][] = [
  ['A','B','C','D','E','F'],
  ['G','H','I','J','K','L'],
  ['M','N','O','P','Q','R'],
  ['S','T','U','V','W','X'],
  ['Y','Z','1','2','3','4'],
  ['5','6','7','8','9','_'],
]

const FLASH_MS  = 250   // ms each row/col stays highlighted
const ISI_MS    = 350   // ms blank gap between flashes (slower = more realistic P300)
const N_ROWS    = 6
const N_COLS    = 6
const N_CODES   = N_ROWS + N_COLS

type FlashTarget = { type: 'row' | 'col'; idx: number } | null
type Health = { model_loaded: boolean; device: string; status: string } | null

function getTargetCoords(char: string) {
  for (let r = 0; r < N_ROWS; r++) {
    for (let c = 0; c < N_COLS; c++) {
      if (GRID[r][c] === char) return { row: r, col: c }
    }
  }
  return { row: 2, col: 3 }
}

const EEGCanvas = ({ flash }: { flash: FlashTarget }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetSpikeRef = useRef(false)

  useEffect(() => {
    if (!flash) return
    const coords = getTargetCoords('P')
    if ((flash.type === 'row' && flash.idx === coords.row) || (flash.type === 'col' && flash.idx === coords.col)) {
      targetSpikeRef.current = true
      const t = setTimeout(() => { targetSpikeRef.current = false }, 320)
      return () => clearTimeout(t)
    }
  }, [flash])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    const channels = [
      { name: 'Cz', yBase: 40 },
      { name: 'Pz', yBase: 85 },
      { name: 'CP1', yBase: 130 },
      { name: 'CP2', yBase: 175 }
    ]

    let offset = 0

    const draw = () => {
      ctx.fillStyle = '#0B0E14'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      const isTargetFlashActive = targetSpikeRef.current
      offset += 1

      channels.forEach((ch) => {
        ctx.beginPath()
        ctx.lineWidth = isTargetFlashActive ? 2.5 : 1.2
        ctx.strokeStyle = isTargetFlashActive ? '#FF7B72' : '#475569'
        
        if (isTargetFlashActive) {
          ctx.shadowColor = '#FF7B72'
          ctx.shadowBlur = 10
        } else {
          ctx.shadowBlur = 0
        }

        for (let x = 0; x < canvas.width; x += 2) {
          let noise = (Math.sin((x + offset * 2) * 0.05) * 4) + (Math.random() * 2)
          if (isTargetFlashActive && x > canvas.width - 150) {
            noise += Math.sin((x - (canvas.width - 150)) * 0.08) * 28
          }
          let y = ch.yBase + noise
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()

        ctx.shadowBlur = 0
        ctx.fillStyle = isTargetFlashActive ? '#FF7B72' : '#8B949E'
        ctx.font = '11px monospace'
        ctx.fillText(ch.name, 12, ch.yBase - 15)
      })

      if (isTargetFlashActive) {
        ctx.fillStyle = '#FF7B72'
        ctx.font = 'bold 11px monospace'
        ctx.fillText('[ P300 ERP TARGET DETECTED ]', canvas.width - 230, 20)
      }

      animationFrameId = requestAnimationFrame(draw)
    }
    draw()

    return () => cancelAnimationFrame(animationFrameId)
  }, [])

  return (
    <div className="flex h-[220px] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0E14] shadow-lg">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 px-4 py-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">LIVE EEG SIGNAL MONITOR (Cz, Pz, CP1, CP2)</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> LIVE SYNCHRONIZED
        </span>
      </div>
      <div className="relative w-full flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" width={1000} height={190} />
      </div>
    </div>
  )
}

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function BCISpellerPage() {
  const [typed,      setTyped]      = useState('')
  const [flash,      setFlash]      = useState<FlashTarget>(null)
  const [running,    setRunning]    = useState(false)
  const [health,     setHealth]     = useState<Health>(null)
  const [llmWords,   setLlmWords]   = useState<string[]>(['YOU','YOUR','YOURSELF'])
  const [lastChar,   setLastChar]   = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [decoding,   setDecoding]   = useState(false)
  const [repCount,   setRepCount]   = useState(2)
  const [simTarget,  setSimTarget]  = useState('WHO ARE YOU')
  const [simResult,  setSimResult]  = useState<string | null>(null)
  const [statusMsg,  setStatusMsg]  = useState('Ready — click Start Flash Sequence')
  const stopRef = useRef(false)

  // Health poll every 5 s
  useEffect(() => {
    const poll = async () => {
      try { setHealth(await (await fetch(`${API}/health`)).json()) }
      catch { setHealth(null) }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  // LLM predict on every typed change
  const fetchLLM = useCallback(async (ctx: string) => {
    try {
      const r = await fetch(`${API}/api/llm_predict?context=${encodeURIComponent(ctx)}`)
      const d = await r.json()
      setLlmWords(d.predictions ?? [])
    } catch {}
  }, [])
  useEffect(() => { fetchLLM(typed) }, [typed, fetchLLM])

  // Flash loop — rows 0→5 first, then cols 0→5 (each rep)
  const startFlash = async () => {
    await fetch(`${API}/api/framework/reset`, { method: 'POST' }).catch(() => {})
    stopRef.current = false
    setRunning(true)
    setDecoding(false)
    setStatusMsg('Flashing rows then columns…')

    // Deterministic order: rows 0→5 then cols 0→5, repeated repCount times
    const sequence: { type: 'row' | 'col'; idx: number }[] = []
    for (let rep = 0; rep < repCount; rep++) {
      for (let r = 0; r < N_ROWS; r++)  sequence.push({ type: 'row', idx: r })
      for (let c = 0; c < N_COLS; c++)  sequence.push({ type: 'col', idx: c })
    }

    for (const { type: ft, idx } of sequence) {
      if (stopRef.current) break
      setFlash({ type: ft, idx })
      await new Promise(r => setTimeout(r, FLASH_MS))
      setFlash(null)
      fetch(`${API}/api/framework/process_flash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flash_type: ft, flash_index: idx }),
      }).catch(() => {})
      await new Promise(r => setTimeout(r, ISI_MS))
    }

    if (!stopRef.current) {
      setDecoding(true)
      setStatusMsg('Decoding…')
      try {
        const d = await (await fetch(`${API}/api/framework/decode`)).json()
        const ch = d.decoded_character as string
        setLastChar(ch)
        setConfidence(Math.round(d.confidence))
        setTyped(prev => prev + (ch === '_' ? ' ' : ch))
        setStatusMsg(`Decoded: "${ch}"  |  Confidence: ${Math.round(d.confidence)}%`)
      } catch { setStatusMsg('Decode error — is backend running on :8000?') }
      setDecoding(false)
    }
    setRunning(false)
    setFlash(null)
  }

  const stopFlash = () => { stopRef.current = true; setRunning(false); setFlash(null); setStatusMsg('Stopped') }

  // Simulate full sentence
  const runSim = async () => {
    setSimResult(null)
    setStatusMsg('Simulating sentence…')
    try {
      const r = await fetch(`${API}/api/simulate_sentence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_text: simTarget, n_reps: repCount, snr_scale: 2.0 }),
      })
      const d = await r.json()
      const decoded = (d.decoded_sentence as string)
      setSimResult(decoded)
      setTyped(prev => prev + decoded.replace(/_/g, ' '))
      setStatusMsg(`Simulation done: "${decoded}"`)
    } catch { setStatusMsg('Simulation error — check backend') }
  }

  const appendWord = (w: string) => {
    setTyped(prev => {
      const trimmed = prev.trimEnd()
      const parts   = trimmed.split(' ')
      const last    = parts[parts.length - 1].toUpperCase()
      return last && w.toUpperCase().startsWith(last)
        ? trimmed.slice(0, trimmed.length - last.length) + w + ' '
        : (trimmed ? trimmed + ' ' : '') + w + ' '
    })
  }

  const cellCls = (r: number, c: number) => {
    const lit = (flash?.type === 'row' && flash.idx === r) || (flash?.type === 'col' && flash.idx === c)
    return [
      'flex items-center justify-center rounded-lg text-sm font-bold transition-all duration-75 h-11 w-full border select-none',
      lit
        ? 'bg-brand text-brand-foreground shadow-[0_0_18px_-2px] shadow-brand/70 scale-[1.06] border-brand/60'
        : 'bg-card/50 text-muted-foreground border-border/30 hover:bg-card hover:text-foreground',
    ].join(' ')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav simplified />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8">

        {/* ── Page header ─────────────────────────────────── */}
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">BCI Speller &amp; Predictive LLM</h1>
            <p className="mt-1 text-sm text-muted-foreground">P300 EEGNet · 6×6 matrix · context-aware word completion</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card px-4 py-2 text-xs">
            <span className={`size-2 rounded-full ${health?.model_loaded ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
            <span className="text-muted-foreground">
              {health ? `EEGNet · ${health.device?.toUpperCase()} · ${health.status}` : 'Backend offline'}
            </span>
          </div>
        </div>

        {/* ── 3-panel grid ─────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[260px_1fr_240px]">

          {/* ── LEFT: Output + Controls ───────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Text output */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Typed Output</span>
                <span className="text-[11px] text-muted-foreground">{typed.length} chars</span>
              </div>
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                placeholder="Start spelling…"
                className="min-h-[90px] w-full resize-none rounded-lg border border-border/30 bg-background/60 p-3 font-mono text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[
                  { id:'btn-space',     label:'Space',   onClick:() => setTyped(p => p + ' ') },
                  { id:'btn-backspace', label:'⌫ Back',  onClick:() => setTyped(p => p.slice(0,-1)) },
                  { id:'btn-clear',     label:'Clear',   onClick:() => { setTyped(''); setSimResult(null) }, danger: true },
                ].map(b => (
                  <button key={b.id} id={b.id} onClick={b.onClick}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${b.danger ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20' : 'border-border/50 bg-secondary text-foreground hover:bg-secondary/70'}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Flash controls */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <span className="mb-3 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Flash Controls</span>
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Repetitions</span><span>{repCount} reps · {repCount * N_CODES} flashes</span>
                </div>
                <input id="rep-count" type="range" min={2} max={20} value={repCount}
                  onChange={e => setRepCount(Number(e.target.value))}
                  className="w-full accent-[oklch(0.62_0.19_255)]" />
              </div>
              <button id="btn-flash-start" disabled={decoding}
                onClick={running ? stopFlash : startFlash}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  running
                    ? 'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25'
                    : 'bg-brand text-brand-foreground shadow-[0_0_20px_-4px] shadow-brand/50 hover:bg-brand/90'
                }`}>
                {running ? '⏹ Stop' : '▶ Start Flash Sequence'}
              </button>
              <div className="mt-2.5 rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-[11px]">
                {decoding
                  ? <span className="text-brand animate-pulse">⚡ {statusMsg}</span>
                  : <span className="text-muted-foreground">{statusMsg}</span>
                }
              </div>
              {lastChar && confidence > 0 && (
                <div className="mt-2 rounded-lg border border-brand/25 bg-brand/8 px-3 py-2 flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Last decoded</span>
                  <span className="font-mono text-sm font-bold text-brand">{lastChar} · {confidence}%</span>
                </div>
              )}
            </div>

            {/* Simulation */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <span className="mb-3 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Simulation Mode</span>
              <input id="sim-target" type="text" value={simTarget} placeholder="WHO ARE YOU"
                onChange={e => setSimTarget(e.target.value.toUpperCase())}
                className="mb-2 w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-brand" />
              <button id="btn-simulate" onClick={runSim}
                className="w-full rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/20 transition-colors">
                Run Synthetic Sentence Decode
              </button>
              {simResult && (
                <div className="mt-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2 font-mono text-[11px] text-foreground break-all">
                  → {simResult}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER: P300 Grid ──────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border/50 bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">P300 6×6 Speller Matrix</span>
                {running && (
                  <span className="flex items-center gap-1.5 text-[11px] text-brand animate-pulse">
                    <span className="size-1.5 rounded-full bg-brand inline-block" />Flashing
                  </span>
                )}
              </div>

              <div className="grid grid-cols-6 gap-2">
                {GRID.map((row, r) => row.map((ch, c) => (
                  <div key={`${r}-${c}`} className={cellCls(r, c)}>{ch}</div>
                )))}
              </div>

              <div className="mt-4 flex justify-between text-[11px] text-muted-foreground/50">
                <span>Rows 0→5 first · then Cols 0→5 · per rep</span>
                <span>{repCount} reps → {repCount * (N_ROWS + N_COLS)} total flashes</span>
              </div>
            </div>

            {/* Live EEG Canvas */}
            <EEGCanvas flash={flash} />

            {/* Confidence bar */}
            {confidence > 0 && (
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="mb-2 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Decode Confidence</span>
                  <span className="font-semibold text-foreground">{confidence}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width:`${confidence}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: LLM + Quick words ───────────────────── */}
          <div className="flex flex-col gap-4">

            {/* LLM predictions */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">LLM Predictions</span>
                <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">Live</span>
              </div>
              <div className="flex flex-col gap-2">
                {llmWords.map((w, i) => (
                  <button key={w} id={`llm-word-${i}`} onClick={() => appendWord(w)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                      i === 0
                        ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'
                        : 'border-border/40 bg-secondary/50 text-foreground hover:border-brand/30 hover:bg-secondary'
                    }`}>
                    {w}
                    {i === 0 && <span className="ml-2 text-[10px] font-normal opacity-60">top pick</span>}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground/50 leading-relaxed">
                Click to insert. Updates after each decoded character.
              </p>
            </div>

            {/* Context display */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">LLM Context</span>
              <div className="min-h-[40px] rounded-lg bg-background/50 p-2 font-mono text-[11px] text-muted-foreground break-all">
                {typed || '—'}
              </div>
            </div>

            {/* Quick insert */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <span className="mb-3 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quick Insert</span>
              <div className="grid grid-cols-2 gap-2">
                {['YES','NO','HELP','WATER','PAIN','STOP','CALL','NEED'].map(w => (
                  <button key={w} id={`quick-${w.toLowerCase()}`} onClick={() => appendWord(w)}
                    className="rounded-lg border border-border/40 bg-secondary/40 px-2 py-2 text-xs font-medium text-foreground hover:border-brand/30 hover:bg-brand/10 hover:text-brand transition-all">
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Backend info */}
            <div className="rounded-xl border border-border/50 bg-card p-4 text-[11px] space-y-2">
              <span className="block font-semibold uppercase tracking-widest text-muted-foreground">Backend Status</span>
              {health ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">API</span><span className="text-emerald-400">{health.status}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Device</span><span className="text-foreground uppercase">{health.device}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">EEGNet</span><span className={health.model_loaded ? 'text-emerald-400' : 'text-red-400'}>{health.model_loaded ? 'Loaded ✓' : 'Not loaded'}</span></div>
                </>
              ) : (
                <div className="text-red-400 text-[11px]">
                  Offline. Start with:<br />
                  <code className="text-[10px] text-muted-foreground/70">cd backend && uvicorn main:app --port 8000</code>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

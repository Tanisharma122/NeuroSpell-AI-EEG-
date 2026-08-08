'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Siren, Home, Brain, Square } from 'lucide-react'

// ─── P300 Flashing Parameters ───────────────────────────────────────────────
const FLASH_DURATION = 150 // ms — active highlight duration
const ISI = 100            // ms — inter-stimulus interval (blank gap)
const TOTAL_ROUNDS = 5     // number of full randomized repetition rounds

// ─── Module Node Definitions ─────────────────────────────────────────────────
const nodes = [
  { label: 'BCI Speller & Predictive LLM', desc: 'Real-time 6x6 matrix speller with context-aware word completion.', icon: MessageSquare, href: '/features/bci-speller' },
  { label: 'Emergency Caregiver Dispatch',  desc: 'Hands-free 1-step panic alert with Twilio SMS and audible alarms.',    icon: Siren,          href: null },
  { label: 'Neurotech Home Automation',     desc: 'Direct brainwave commands for smart lighting, beds, and climate.',       icon: Home,           href: null },
]

// ─── Fisher-Yates Shuffle ─────────────────────────────────────────────────────
function shuffle(arr: number[]): number[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Confirmation Chime (Web Audio API) ──────────────────────────────────────
function playChime() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const notes = [523.25, 659.25, 783.99] // C5 → E5 → G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      const t0 = ctx.currentTime + i * 0.14
      osc.frequency.setValueAtTime(freq, t0)
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38)
      osc.start(t0)
      osc.stop(t0 + 0.4)
    })
  } catch { /* silently ignore on unsupported browsers */ }
}

// ─── Card State Type ──────────────────────────────────────────────────────────
type CardState = 'idle' | 'flash' | 'selected'

// ─── Inline Style Helpers ─────────────────────────────────────────────────────
function getCardStyle(state: CardState): React.CSSProperties {
  if (state === 'flash') return {
    background: 'rgba(255, 224, 102, 0.05)',
    border: '2px solid #FFE066',
    boxShadow: '0 0 35px rgba(255, 224, 102, 0.5), inset 0 0 15px rgba(255, 224, 102, 0.2)',
    transform: 'translateY(-4px) scale(1.03)',
    transition: 'all 0.12s ease-in-out',
  }
  if (state === 'selected') return {
    background: 'rgba(16, 185, 129, 0.06)',
    border: '2px solid #10B981',
    boxShadow: '0 0 40px rgba(16, 185, 129, 0.6)',
    transform: 'scale(1.0)',
    transition: 'all 0.12s ease-in-out',
    animation: 'p300CardPop 0.4s ease-out forwards',
  }
  return {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    transform: 'translateY(0) scale(1)',
    transition: 'all 0.12s ease-in-out',
  }
}

function getIconStyle(state: CardState): React.CSSProperties {
  if (state === 'flash') return { filter: 'brightness(2.5) drop-shadow(0 0 10px #FFE066)' }
  if (state === 'selected') return { filter: 'brightness(2) drop-shadow(0 0 10px #10B981)' }
  return {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export function FeatureSuite() {
  const router = useRouter()
  const [cardStates, setCardStates] = useState<CardState[]>(['idle', 'idle', 'idle'])
  const [isRunning, setIsRunning] = useState(false)
  const [round, setRound] = useState(0)
  const [statusText, setStatusText] = useState(
    'Click "Start BCI Demo" to begin P300 sequential flashing'
  )

  // Refs so closures always see latest values
  const isRunningRef = useRef(false)
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([])

  // EEG Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spikeRef = useRef<{ active: boolean; t: number }>({ active: false, t: 0 })
  const animIdRef = useRef<number>()

  // ── EEG Canvas Loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const BUF = W
    const czBuf = new Float32Array(BUF)
    const pzBuf = new Float32Array(BUF)
    let wIdx = 0
    let tick = 0

    function sample(t: number, offset: number, scale: number) {
      const noise = (Math.random() - 0.5) * 3
      const alpha = Math.sin(t * 0.07) * 2.5
      const theta = Math.sin(t * 0.04) * 1.8
      let s = noise + alpha + theta
      // P300 spike morphology (sharp positive bell ~300ms post-stimulus)
      if (spikeRef.current.active) {
        const st = (spikeRef.current.t - offset) / 28
        s += Math.exp(-Math.pow(st - 1.4, 2) / 0.45) * 20 * scale
      }
      return s
    }

    function drawFrame() {
      if (spikeRef.current.active) {
        spikeRef.current.t++
        if (spikeRef.current.t > 75) {
          spikeRef.current.active = false
          spikeRef.current.t = 0
        }
      }

      czBuf[wIdx] = sample(tick, 0, 1.0)
      pzBuf[wIdx] = sample(tick, 4, 1.25)
      wIdx = (wIdx + 1) % BUF
      tick++

      // Background
      ctx.fillStyle = 'rgba(6, 10, 22, 0.97)'
      ctx.fillRect(0, 0, W, H)

      // Subtle grid
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.07)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += H / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // Channels
      const channels = [
        { label: 'Cz', buf: czBuf, color: '#3B82F6', baseY: H * 0.3 },
        { label: 'Pz', buf: pzBuf, color: '#EF4444', baseY: H * 0.72 },
      ]
      channels.forEach(({ label, buf, color, baseY }) => {
        // Label badge
        ctx.fillStyle = color + '30'
        ctx.beginPath()
        ctx.roundRect(5, baseY - 20, 22, 14, 3)
        ctx.fill()
        ctx.fillStyle = color
        ctx.font = 'bold 9px monospace'
        ctx.fillText(label, 8, baseY - 9)

        // Waveform
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.6
        ctx.shadowColor = color
        ctx.shadowBlur = 5
        for (let i = 0; i < BUF; i++) {
          const di = (wIdx + i) % BUF
          const x = (i / BUF) * W
          const y = baseY - buf[di] * 2.8
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      })

      // Live indicator
      if (isRunningRef.current) {
        const pulse = Math.sin(Date.now() / 400) > 0
        if (pulse) {
          ctx.fillStyle = '#10B981'
          ctx.beginPath()
          ctx.arc(W - 12, 12, 4, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = '#10B981'
        ctx.font = 'bold 8px monospace'
        ctx.fillText('P300 ACTIVE', W - 75, 14)
      } else {
        ctx.fillStyle = 'rgba(100,116,139,0.6)'
        ctx.font = '8px monospace'
        ctx.fillText('● LSL 512Hz', W - 58, 14)
      }

      animIdRef.current = requestAnimationFrame(drawFrame)
    }

    drawFrame()
    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current)
    }
  }, [])

  // ── Timer helpers ──────────────────────────────────────────────────────────
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timerIds.current.push(id)
    return id
  }, [])

  const clearAll = useCallback(() => {
    timerIds.current.forEach(clearTimeout)
    timerIds.current = []
  }, [])

  // ── Trigger P300 EEG spike ─────────────────────────────────────────────────
  const triggerSpike = useCallback(() => {
    spikeRef.current = { active: true, t: 0 }
  }, [])

  // ── Winner selection ───────────────────────────────────────────────────────
  const selectWinner = useCallback((idx: number) => {
    setCardStates(s => s.map((_, i) => (i === idx ? 'selected' : 'idle')))
    setStatusText(`✅ P300 Target Locked → ${nodes[idx].label}`)
    setIsRunning(false)
    isRunningRef.current = false
    playChime()

    // Scroll to module deep-dives after 800ms
    later(() => {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 800)

    // Reset after 3.5s
    later(() => {
      setCardStates(['idle', 'idle', 'idle'])
      setStatusText('Click "Start BCI Demo" to begin P300 sequential flashing')
    }, 3500)
  }, [later])

  // ── Recursive flash round runner ───────────────────────────────────────────
  const runRound = useCallback(
    (roundIdx: number, targetIdx: number) => {
      if (!isRunningRef.current) return

      if (roundIdx >= TOTAL_ROUNDS) {
        selectWinner(targetIdx)
        return
      }

      setRound(roundIdx + 1)
      setStatusText(`🧠 Round ${roundIdx + 1} / ${TOTAL_ROUNDS}  —  P300 flashing…`)

      const seq = shuffle([0, 1, 2])

      const flashCard = (seqPos: number) => {
        if (!isRunningRef.current) return

        if (seqPos >= seq.length) {
          // End of this round → pause ISI then start next
          later(() => runRound(roundIdx + 1, targetIdx), ISI)
          return
        }

        const cardIdx = seq[seqPos]

        // Flash ON
        setCardStates(prev => prev.map((_, i) => (i === cardIdx ? 'flash' : 'idle')))

        // Inject P300 ERP spike when target card flashes
        if (cardIdx === targetIdx) triggerSpike()

        // Flash OFF after FLASH_DURATION, then ISI, then next card
        later(() => {
          setCardStates(['idle', 'idle', 'idle'])
          later(() => flashCard(seqPos + 1), ISI)
        }, FLASH_DURATION)
      }

      flashCard(0)
    },
    [later, selectWinner, triggerSpike]
  )

  // ── Start demo ─────────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    if (isRunning) return
    clearAll()
    setCardStates(['idle', 'idle', 'idle'])
    setRound(0)
    isRunningRef.current = true
    setIsRunning(true)
    // Pick a random target card each demo run
    const targetIdx = Math.floor(Math.random() * 3)
    setStatusText(`🧠 BCI Demo started — target card: ${targetIdx + 1}`)
    later(() => runRound(0, targetIdx), 400)
  }, [isRunning, clearAll, later, runRound])

  // ── Stop demo ──────────────────────────────────────────────────────────────
  const stopDemo = useCallback(() => {
    clearAll()
    isRunningRef.current = false
    setIsRunning(false)
    setRound(0)
    setCardStates(['idle', 'idle', 'idle'])
    setStatusText('Demo stopped — click "Start BCI Demo" to restart')
  }, [clearAll])

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <section id="suite" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">

      {/* Keyframe injection */}
      <style>{`
        @keyframes p300CardPop {
          0%   { transform: scale(1.05); }
          55%  { transform: scale(0.97); }
          100% { transform: scale(1.0);  }
        }
      `}</style>

      {/* Section header */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
          Integrated BCI Platform
        </p>
        <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          A fully integrated suite of modules, powered by P300 AI.
        </h2>
      </div>

      {/* ── EEG Live Monitor strip ── */}
      <div className="relative mt-10 overflow-hidden rounded-2xl border border-border/60 bg-[#060A16]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand shadow-[0_0_6px_2px] shadow-brand/60" />
            <span className="font-mono text-[11px] font-semibold tracking-wider text-brand">
              EEG Live Monitor — Cz / Pz
            </span>
          </div>
          <div className="flex items-center gap-4">
            {isRunning && (
              <span className="font-mono text-[10px] text-emerald-400">
                Round {round} / {TOTAL_ROUNDS}
              </span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">512 Hz | eegnet_p300.pt</span>
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={1200}
          height={120}
          className="w-full"
          style={{ height: '120px', display: 'block' }}
        />

        {/* Status + Controls bar */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5">
          <span className="truncate font-mono text-[10px] text-muted-foreground max-w-xs">
            {statusText}
          </span>
          <div className="flex shrink-0 items-center gap-2 pl-4">
            {!isRunning ? (
              <button
                onClick={startDemo}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 font-mono text-[11px] font-semibold text-white shadow-[0_0_18px_-4px] shadow-brand/70 transition-all hover:bg-brand/90 hover:shadow-brand/90 active:scale-95"
              >
                <Brain className="size-3.5" />
                Start BCI Demo
              </button>
            ) : (
              <button
                onClick={stopDemo}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-red-400 transition-all hover:bg-red-500/20 active:scale-95"
              >
                <Square className="size-3" />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Hub + Card nodes ── */}
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-border bg-card px-6 py-14 sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full bg-brand/15 blur-[100px]"
        />

        <div className="relative flex flex-col items-center">
          {/* Central N hub */}
          <div className="relative flex size-24 items-center justify-center rounded-2xl bg-brand text-4xl font-bold text-brand-foreground shadow-[0_0_50px_-6px] shadow-brand">
            N
          </div>

          {/* SVG connector lines */}
          <div className="relative mt-0 hidden h-16 w-full max-w-3xl md:block">
            <svg className="h-full w-full" viewBox="0 0 600 64" fill="none" preserveAspectRatio="none">
              <path d="M300 0 L300 20 L110 20 L110 64" stroke="currentColor" className="text-brand/50" strokeWidth="1.5" />
              <path d="M300 0 L300 64"                  stroke="currentColor" className="text-brand/50" strokeWidth="1.5" />
              <path d="M300 0 L300 20 L490 20 L490 64" stroke="currentColor" className="text-brand/50" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Module cards — P300 flash targets */}
          <div className="mt-8 grid w-full max-w-3xl gap-6 md:mt-0 md:grid-cols-3">
            {nodes.map((node, idx) => {
              const Icon = node.icon
              const state = cardStates[idx]
              return (
                <div
                  key={node.label}
                  className="landing-module-card flex flex-col items-center gap-3 rounded-xl p-6 text-center cursor-pointer"
                  style={getCardStyle(state)}
                  onClick={() => {
                    if (node.href) {
                      router.push(node.href)
                    } else {
                      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                >
                  {/* Icon wrapper */}
                  <span
                    className="flex size-12 items-center justify-center rounded-lg border border-brand/50 bg-brand/10 text-brand"
                    style={getIconStyle(state)}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                  </span>

                  {/* Label */}
                  <span
                    className="font-semibold text-foreground"
                    style={state === 'flash' ? { color: '#FFE066' } : state === 'selected' ? { color: '#10B981' } : {}}
                  >
                    {node.label}
                  </span>

                  {/* Description */}
                  <span className="text-sm text-muted-foreground">{node.desc}</span>

                  {/* State badge */}
                  {state === 'selected' && (
                    <span className="mt-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                      ✓ P300 Target Locked
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Demo hint */}
          <p className="mt-8 font-mono text-[10px] text-muted-foreground/50 text-center">
            {isRunning
              ? '⚡ Cards flashing in randomized P300 sequence — watch for the ERP spike on Cz/Pz above'
              : '▲ Press "Start BCI Demo" above to run the hands-free P300 sequential card selection engine'}
          </p>
        </div>
      </div>
    </section>
  )
}

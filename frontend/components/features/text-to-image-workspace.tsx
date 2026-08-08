'use client'

import { useState } from 'react'
import {
  Sparkles,
  Wand2,
  RefreshCw,
  Download,
  CheckCircle2,
  Image as ImageIcon,
  ArrowRight,
  RotateCcw,
  Pencil,
  Zap,
  AlertCircle,
  Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const STYLES = ['Cinematic', 'Cyberpunk', '3D Render', 'Anime', 'Pixel Art', 'Watercolor', 'None']
const LIGHTINGS = ['Moody Blue', 'Golden Hour', 'Neon Glow', 'Studio', 'Sunlight', 'Dramatic', 'None']
const COMPOSITIONS = ['Wide Shot', 'Close Up', 'Extreme Close Up', 'Isometric', 'Drone View', 'None']

type ImageSize = { label: string; w: number; h: number; tag: string }

const IMAGE_SIZES: { group: string; sizes: ImageSize[] }[] = [
  {
    group: '⬛ Square',
    sizes: [
      { label: '512 × 512',   w: 512,  h: 512,  tag: 'SD' },
      { label: '768 × 768',   w: 768,  h: 768,  tag: 'HD' },
      { label: '1024 × 1024', w: 1024, h: 1024, tag: '1K' },
    ],
  },
  {
    group: '🖼 Landscape',
    sizes: [
      { label: '768 × 512',   w: 768,  h: 512,  tag: '3:2' },
      { label: '1024 × 576',  w: 1024, h: 576,  tag: '16:9' },
      { label: '1152 × 768',  w: 1152, h: 768,  tag: '3:2 HD' },
      { label: '1216 × 832',  w: 1216, h: 832,  tag: '3:2 XL' },
      { label: '1280 × 720',  w: 1280, h: 720,  tag: '720p' },
      { label: '1344 × 768',  w: 1344, h: 768,  tag: '16:9 HD' },
      { label: '1536 × 640',  w: 1536, h: 640,  tag: 'Ultra-wide' },
      { label: '1920 × 1080', w: 1920, h: 1080, tag: '1080p' },
    ],
  },
  {
    group: '📱 Portrait',
    sizes: [
      { label: '512 × 768',   w: 512,  h: 768,  tag: '2:3' },
      { label: '576 × 1024',  w: 576,  h: 1024, tag: '9:16' },
      { label: '768 × 1152',  w: 768,  h: 1152, tag: '2:3 HD' },
      { label: '832 × 1216',  w: 832,  h: 1216, tag: '2:3 XL' },
      { label: '720 × 1280',  w: 720,  h: 1280, tag: '9:16 HD' },
      { label: '768 × 1344',  w: 768,  h: 1344, tag: '9:16 XL' },
      { label: '640 × 1536',  w: 640,  h: 1536, tag: 'Ultra-tall' },
      { label: '1080 × 1920', w: 1080, h: 1920, tag: '1080p Portrait' },
    ],
  },
]

const DEFAULT_SIZE: ImageSize = { label: '1024 × 1024', w: 1024, h: 1024, tag: '1K' }

type Stage = 'compose' | 'enhancing' | 'review' | 'generating' | 'done' | 'error'

export function TextToImageWorkspace() {
  const [rawPrompt, setRawPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('Cinematic')
  const [selectedLighting, setSelectedLighting] = useState('Moody Blue')
  const [selectedComposition, setSelectedComposition] = useState('Wide Shot')
  const [selectedSize, setSelectedSize] = useState<ImageSize>(DEFAULT_SIZE)
  const [stage, setStage] = useState<Stage>('compose')
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [isFallback, setIsFallback] = useState(false)
  const [generatedImage, setGeneratedImage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const isLocked = stage === 'enhancing' || stage === 'generating'

  const handleEnhance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rawPrompt.trim() || isLocked) return
    setStage('enhancing')
    setEnhancedPrompt('')
    setGeneratedImage('')
    setIsFallback(false)
    setErrorMsg('')
    const fullPrompt = [
      rawPrompt.trim(),
      selectedStyle !== 'None' ? `style: ${selectedStyle}` : '',
      selectedLighting !== 'None' ? `lighting: ${selectedLighting}` : '',
      selectedComposition !== 'None' ? `composition: ${selectedComposition}` : '',
    ].filter(Boolean).join(', ')
    try {
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Prompt enhancement failed.')
      setEnhancedPrompt(data.enhancedPrompt)
      setIsFallback(!!data.fallback)
      setStage('review')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.')
      setStage('error')
    }
  }

  const handleGenerate = async () => {
    if (!enhancedPrompt || isLocked) return
    setStage('generating')
    setGeneratedImage('')
    setErrorMsg('')
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhancedPrompt, width: selectedSize.w, height: selectedSize.h }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Image generation failed.')
      setGeneratedImage(data.imageUri)
      setStage('done')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.')
      setStage('error')
    }
  }

  const handleReset = () => {
    setStage('compose')
    setRawPrompt('')
    setSelectedSize(DEFAULT_SIZE)
    setEnhancedPrompt('')
    setIsFallback(false)
    setGeneratedImage('')
    setErrorMsg('')
  }

  const handleBackToEdit = () => {
    setStage('compose')
    setEnhancedPrompt('')
    setIsFallback(false)
    setErrorMsg('')
  }

  const handleDownload = () => {
    if (!generatedImage) return
    const link = document.createElement('a')
    link.href = generatedImage
    link.download = `createct-ai-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full bg-brand/10 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-brand/8 blur-[120px]" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-7">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand">
            <Wand2 className="size-4" />
            Contextual Asset Engine
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
            AI Text-to-Image Workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Describe your scene, let our AI craft the perfect visual prompt, review &amp; confirm — then watch your image come to life.
          </p>
        </div>

        {/* Step progress bar */}
        <div className="mb-8 flex items-center">
          {[
            { id: 'compose', label: 'Step 1', sub: 'Your Idea' },
            { id: 'review',  label: 'Step 2', sub: 'Review Prompt' },
            { id: 'done',    label: 'Step 3', sub: 'Generate Image' },
          ].map((s, i) => {
            const isComplete =
              (s.id === 'compose' && ['review', 'generating', 'done'].includes(stage)) ||
              (s.id === 'review'  && ['generating', 'done'].includes(stage))
            const isActive =
              stage === s.id ||
              (s.id === 'compose' && stage === 'enhancing') ||
              (s.id === 'review'  && stage === 'generating') ||
              (s.id === 'done'    && stage === 'done')
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    isComplete
                      ? 'bg-brand text-brand-foreground'
                      : isActive
                      ? 'border-2 border-brand text-brand bg-brand/10'
                      : 'border border-border text-muted-foreground bg-card/30'
                  }`}>
                    {isComplete ? <CheckCircle2 className="size-4" /> : i + 1}
                  </div>
                  <div className="text-center">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isActive || isComplete ? 'text-brand' : 'text-muted-foreground'}`}>
                      {s.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground hidden sm:block">{s.sub}</p>
                  </div>
                </div>
                {i < 2 && (
                  <div className={`mx-3 h-px w-12 sm:w-24 transition-colors ${isComplete ? 'bg-brand/60' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Main grid: LEFT = controls, RIGHT = image + enhanced prompt ── */}
        <div className="grid gap-8 lg:grid-cols-12">

          {/* ── LEFT PANEL ── */}
          <div className="flex flex-col gap-5 lg:col-span-5">

            {/* STAGE: compose / error */}
            {(stage === 'compose' || stage === 'error') && (
              <form onSubmit={handleEnhance}
                className="flex flex-col gap-5 rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-md">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">1</span>
                  Describe your scene idea
                </p>
                <textarea
                  id="prompt-input"
                  value={rawPrompt}
                  onChange={(e) => setRawPrompt(e.target.value)}
                  placeholder="e.g. A futuristic cyber-punk coffee shop in Tokyo with rain sliding down windows..."
                  rows={5}
                  className="w-full rounded-xl border border-border bg-background p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand resize-none"
                  required
                />
                {/* Presets */}
                <div className="space-y-4">
                  {[
                    { label: 'Style',       options: STYLES,       value: selectedStyle,       setter: setSelectedStyle },
                    { label: 'Lighting',    options: LIGHTINGS,    value: selectedLighting,    setter: setSelectedLighting },
                    { label: 'Composition', options: COMPOSITIONS, value: selectedComposition, setter: setSelectedComposition },
                  ].map(({ label, options, value, setter }) => (
                    <div key={label} className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((opt) => (
                          <button key={opt} type="button" onClick={() => setter(opt)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                              value === opt
                                ? 'bg-brand/20 border-brand text-brand'
                                : 'border-border bg-background/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* ── Image Size Selector ── */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Maximize2 className="size-3" />
                      Image Size
                      <span className="ml-auto font-normal normal-case text-brand">{selectedSize.label} ({selectedSize.tag})</span>
                    </label>
                    <div className="rounded-xl border border-border bg-background/50 p-3 space-y-3 max-h-52 overflow-y-auto">
                      {IMAGE_SIZES.map(({ group, sizes }) => (
                        <div key={group}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{group}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {sizes.map((size) => {
                              const isActive = selectedSize.label === size.label
                              return (
                                <button
                                  key={size.label}
                                  type="button"
                                  onClick={() => setSelectedSize(size)}
                                  className={`rounded-lg px-2 py-1.5 text-xs font-medium border transition-colors text-left flex items-center justify-between gap-1 ${
                                    isActive
                                      ? 'bg-brand/20 border-brand text-brand'
                                      : 'border-border bg-background/30 text-muted-foreground hover:bg-secondary hover:text-foreground'
                                  }`}
                                >
                                  <span className="font-mono text-[11px]">{size.label}</span>
                                  <span className={`text-[9px] rounded px-1 py-0.5 font-semibold ${
                                    isActive ? 'bg-brand/30 text-brand' : 'bg-border/50 text-muted-foreground'
                                  }`}>{size.tag}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {stage === 'error' && errorMsg && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-start gap-2">
                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                    <span><span className="font-semibold">Error: </span>{errorMsg}</span>
                  </div>
                )}
                <Button type="submit" disabled={!rawPrompt.trim()} id="enhance-btn"
                  className="w-full bg-brand text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/60 hover:bg-brand/90 py-5 text-sm font-semibold gap-2">
                  <Sparkles className="size-4" />
                  Enhance My Prompt
                  <ArrowRight className="size-4 ml-auto" />
                </Button>
              </form>
            )}

            {/* STAGE: enhancing */}
            {stage === 'enhancing' && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 p-10 backdrop-blur-md text-center">
                <div className="relative size-14 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                  <Sparkles className="size-5 text-brand animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Getting your prompt ready…</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Adding cinematic detail, lighting cues, and composition notes to your idea.</p>
                </div>
                <div className="w-full rounded-xl border border-border bg-background/50 p-3 text-left">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Progress</p>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3 text-brand shrink-0" />Your inputs have been received</div>
                    <div className="flex items-center gap-2 text-brand"><RefreshCw className="size-3 animate-spin shrink-0" />Crafting a detailed visual prompt…</div>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE: review */}
            {stage === 'review' && (
              <div className="flex flex-col gap-4 rounded-2xl border border-brand/30 bg-card/40 p-6 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">2</span>
                    Your Enhanced Prompt is Ready
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-brand font-semibold bg-brand/10 border border-brand/30 rounded-full px-2 py-0.5">
                    ✦ AI Enhanced
                  </span>
                </div>
                <div className="rounded-xl border border-brand/40 bg-background/80 p-4 relative">
                  <div className="absolute -top-2.5 left-4 bg-background px-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-brand">
                      Your Enhanced Prompt
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mt-1 font-medium">{enhancedPrompt}</p>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Zap className="size-3 text-brand shrink-0 mt-0.5" />
                  Look good? Confirm to start generating your image, or go back to edit.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Button id="confirm-generate-btn" onClick={handleGenerate}
                    className="w-full bg-brand text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/60 hover:bg-brand/90 py-5 text-sm font-semibold gap-2">
                    <Zap className="size-4" />
                    Confirm &amp; Generate Image
                    <ArrowRight className="size-4 ml-auto" />
                  </Button>
                  <Button id="back-edit-btn" type="button" onClick={handleBackToEdit} variant="outline"
                    className="w-full border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 text-xs">
                    <Pencil className="size-3.5" />
                    Edit my idea &amp; re-enhance
                  </Button>
                </div>
              </div>
            )}

            {/* STAGE: generating */}
            {stage === 'generating' && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 p-10 backdrop-blur-md text-center">
                <div className="relative size-14 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                  <ImageIcon className="size-5 text-brand animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Your image is being created…</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Our AI is painting your scene. This usually takes a few seconds.</p>
                </div>
                <div className="w-full rounded-xl border border-border bg-background/50 p-3 text-left">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Progress</p>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3 text-brand shrink-0" />Prompt received and ready</div>
                    <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3 text-brand shrink-0" />Enhanced prompt confirmed ✓</div>
                    <div className="flex items-center gap-2 text-brand"><RefreshCw className="size-3 animate-spin shrink-0" />Generating your image…</div>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE: done */}
            {stage === 'done' && (
              <div className="flex flex-col gap-4 rounded-2xl border border-brand/30 bg-card/40 p-6 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-brand" />
                  <p className="text-sm font-semibold text-foreground">Image Generated Successfully!</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">What happened</p>
                  <div className="space-y-1 text-xs font-mono text-foreground">
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />Your idea was received</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />Prompt was enhanced with detail</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />Image generated successfully</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={handleDownload} id="download-btn"
                    className="w-full bg-brand text-brand-foreground hover:bg-brand/90 gap-2 text-sm font-semibold shadow-[0_0_20px_-4px] shadow-brand/60">
                    <Download className="size-4" />
                    Download Image
                  </Button>
                  <Button type="button" onClick={handleReset} variant="outline" id="create-new-btn"
                    className="w-full border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 text-xs">
                    <RotateCcw className="size-3.5" />
                    Create a new image
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL — image + enhanced prompt BELOW it ── */}
          <div className="lg:col-span-7 flex flex-col gap-4">

            {/* Image preview box */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl flex flex-col aspect-video items-center justify-center min-h-[300px]">

              {/* Real generated image */}
              {stage === 'done' && generatedImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={generatedImage}
                    alt="AI generated visual asset"
                    className="absolute inset-0 size-full object-cover"
                  />
                  {/* Subtle vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent pointer-events-none" />
                </>
              ) : (
                /* Placeholder / loading states — NO default image */
                <div className="flex flex-col items-center gap-4 text-center p-8">
                  {stage === 'enhancing' && (
                    <>
                      <div className="relative size-16 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                        <Sparkles className="size-6 text-brand animate-pulse" />
                      </div>
                      <p className="font-semibold text-foreground">Getting your prompt ready…</p>
                      <p className="text-xs text-muted-foreground">Adding detail, mood, and composition to your idea</p>
                    </>
                  )}
                  {stage === 'generating' && (
                    <>
                      <div className="relative size-16 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                        <ImageIcon className="size-6 text-brand animate-pulse" />
                      </div>
                      <p className="font-semibold text-foreground">Creating your image…</p>
                      <p className="text-xs text-muted-foreground">Our AI is painting your scene. Almost there!</p>
                      <div className="w-full max-w-xs space-y-2 mt-2">
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-3/4" />
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-full" />
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-2/3" />
                      </div>
                    </>
                  )}
                  {stage === 'review' && (
                    <>
                      <div className="flex size-16 items-center justify-center rounded-2xl border-2 border-brand/40 bg-brand/10 text-brand">
                        <CheckCircle2 className="size-8" />
                      </div>
                      <p className="font-semibold text-foreground">Prompt Ready — Awaiting Confirmation</p>
                      <p className="text-xs text-muted-foreground max-w-xs">Confirm the enhanced prompt on the left to start rendering.</p>
                    </>
                  )}
                  {(stage === 'compose' || stage === 'error') && (
                    <>
                      <div className="flex size-16 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
                        <ImageIcon className="size-8" />
                      </div>
                      <p className="font-semibold text-foreground">Preview will appear here</p>
                      <p className="text-xs text-muted-foreground max-w-sm">Enter your scene idea on the left and run the pipeline — your image will render here.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Enhanced prompt block — BELOW the image ── */}
            {(stage === 'review' || stage === 'generating' || stage === 'done') && enhancedPrompt && (
              <div className="rounded-2xl border border-brand/30 bg-card/50 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="size-3.5 text-brand" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                    Your Enhanced Prompt
                  </p>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {enhancedPrompt}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  )
}

'use client'

import { useState, useRef } from 'react'
import {
  LayoutTemplate, Sparkles, RefreshCw, Download,
  CheckCircle2, ArrowRight, RotateCcw, Image as ImageIcon,
  AlertCircle, User2, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Exact options from thumbnail_generator.py ─────────────────────────────────

const PLATFORM_PRESETS = [
  { name: 'YouTube Video Thumbnail',                    width: 1280, height: 720,  ratio: '16:9', label: '1280 × 720' },
  { name: 'YouTube Shorts / Instagram Reels / TikTok', width: 1080, height: 1920, ratio: '9:16', label: '1080 × 1920' },
  { name: 'Instagram / LinkedIn Square Post',           width: 1080, height: 1080, ratio: '1:1',  label: '1080 × 1080' },
  { name: 'Twitter / LinkedIn Banner',                  width: 1200, height: 675,  ratio: '16:9', label: '1200 × 675' },
]

const CATEGORY_OPTIONS = [
  'Tech & AI', 'Beauty, Fashion & Skincare', 'Design & Art',
  'Vlog & Lifestyle', 'Gaming', 'Finance & Business', 'Motivational', 'Other',
]

const STYLE_OPTIONS = [
  'Minimalist & Aesthetic Premium',
  'Dark & Dramatic (Cinematic)',
  'Bold, Bright & High-Contrast',
  'Iman Gadzhi Luxury Style (Clean Dark Studio)',
  'Realistic Photo / Editorial',
  'Cartoon / Illustrated',
  'Other',
]

const BACKGROUND_OPTIONS = [
  'Aesthetic Pastel & Soft Sunlight (Great for Beauty/Design)',
  'Clean Blurred Modern Studio / Bookshelf',
  'Dark Minimalist Gradient with Soft Accent Light',
  'Sleek High-Tech Desk Setup',
  'Abstract Glowing Grid / Matrix',
  'Pure Solid Color Background (Pop Art style)',
  'Other',
]

const GRAPHIC_ELEMENTS = [
  'Split Screen Comparison (Before vs After)',
  'Floating Sparkles / Glowing Aura (Beauty/Magic)',
  'Highlighted Text Box Banner (Yellow/Cyan Background)',
  'Red Curved Arrow pointing to Subject',
  'Glowing App/Product Icon floating on side',
  'Clean & Minimal (No extra graphics)',
  'Other',
]

const MOOD_OPTIONS = [
  'Aesthetic, Calm & Luxurious', 'Shocking / Surprised',
  'Excited / High-Energy', 'Intense & Serious', 'Urgent / FOMO', 'Other',
]

const FACE_EXPRESSION_OPTIONS = [
  'Confident Smile with direct eye contact',
  'Applying product / Creative focus pose',
  'Jaw-dropped Open Mouth Shock',
  'Pointing at floating object/text',
  'No Face (Pure Object/UI focus)',
  'Other',
]

type Stage = 'compose' | 'generating' | 'done' | 'error'

// ── Chip selector ─────────────────────────────────────────────────────────────
function ChipGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
              value === opt
                ? 'bg-brand/20 border-brand text-brand shadow-[0_0_10px_-3px] shadow-brand/40'
                : 'border-border bg-background/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground shrink-0">
        {num}
      </span>
      {children}
    </p>
  )
}

export function ThumbnailWorkspace() {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedPlatform, setSelectedPlatform] = useState(PLATFORM_PRESETS[0])
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState(CATEGORY_OPTIONS[0])
  const [style,       setStyle]       = useState(STYLE_OPTIONS[0])
  const [background,  setBackground]  = useState(BACKGROUND_OPTIONS[0])
  const [graphicEl,   setGraphicEl]   = useState(GRAPHIC_ELEMENTS[0])
  const [mood,        setMood]        = useState(MOOD_OPTIONS[0])
  const [expression,  setExpression]  = useState(FACE_EXPRESSION_OPTIONS[0])
  const [textOverlay, setTextOverlay] = useState('')

  // ── Photo upload state ─────────────────────────────────────────────────────
  const [userPhotoBase64, setUserPhotoBase64] = useState('')
  const [userPhotoPreview, setUserPhotoPreview] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Pipeline state ─────────────────────────────────────────────────────────
  const [stage,           setStage]           = useState<Stage>('compose')
  const [thumbnailPrompt, setThumbnailPrompt] = useState('')
  const [genaiBoost,      setGenaiBoost]      = useState('')
  const [generatedImage,  setGeneratedImage]  = useState('')
  const [errorMsg,        setErrorMsg]        = useState('')
  const [presetUsed,      setPresetUsed]      = useState(PLATFORM_PRESETS[0])

  const isLocked = stage === 'generating'

  // ── Photo upload handler ───────────────────────────────────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setUserPhotoBase64(result)
      setUserPhotoPreview(result)
    }
    reader.readAsDataURL(file)
  }

  const removePhoto = () => {
    setUserPhotoBase64('')
    setUserPhotoPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Generate handler ───────────────────────────────────────────────────────
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || isLocked) return
    setStage('generating')
    setGeneratedImage(''); setThumbnailPrompt(''); setGenaiBoost(''); setErrorMsg('')

    try {
      const res = await fetch('/api/generate-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:            title.trim(),
          description:      description.trim(),
          platform:         selectedPlatform.name,
          category, style, background,
          graphic_element:  graphicEl,
          mood, expression,
          text_overlay:     textOverlay.trim() || 'WATCH THIS',
          user_image_base64: userPhotoBase64 || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Thumbnail generation failed.')
      setGeneratedImage(data.imageUri)
      setThumbnailPrompt(data.thumbnailPrompt)
      setGenaiBoost(data.genaiBoost || '')
      setPresetUsed(selectedPlatform)
      setStage('done')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.')
      setStage('error')
    }
  }

  const handleReset = () => {
    setStage('compose')
    setTitle(''); setDescription(''); setTextOverlay('')
    setSelectedPlatform(PLATFORM_PRESETS[0])
    setCategory(CATEGORY_OPTIONS[0]); setStyle(STYLE_OPTIONS[0])
    setBackground(BACKGROUND_OPTIONS[0]); setGraphicEl(GRAPHIC_ELEMENTS[0])
    setMood(MOOD_OPTIONS[0]); setExpression(FACE_EXPRESSION_OPTIONS[0])
    setGeneratedImage(''); setThumbnailPrompt(''); setGenaiBoost(''); setErrorMsg('')
    removePhoto()
  }

  const handleDownload = () => {
    if (!generatedImage) return
    const link = document.createElement('a')
    link.href = generatedImage
    link.download = `thumbnail-${Date.now()}.png`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  // Dynamic preview aspect ratio
  const previewStyle =
    selectedPlatform.ratio === '9:16' ? { aspectRatio: '9/16', maxHeight: '520px' } :
    selectedPlatform.ratio === '1:1'  ? { aspectRatio: '1/1',  maxHeight: '480px' } :
                                        { aspectRatio: '16/9' }

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full bg-brand/10 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-brand/8 blur-[120px]" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-7">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand">
            <LayoutTemplate className="size-4" />
            High-CTR Design Suite
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
            AI Thumbnail Generator
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Fill in your video details, pick your style — our AI generates a scroll-stopping thumbnail that strictly follows every preference you set.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">

          {/* ── LEFT: Form ── */}
          <div className="flex flex-col gap-5 lg:col-span-5">

            {(stage === 'compose' || stage === 'error') && (
              <form onSubmit={handleGenerate}
                className="flex flex-col gap-6 rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-md">

                {/* ── Step 1: Platform ── */}
                <div className="flex flex-col gap-3">
                  <SectionLabel num={1}>Target Platform &amp; Resolution</SectionLabel>
                  <div className="grid grid-cols-1 gap-1.5">
                    {PLATFORM_PRESETS.map((p) => (
                      <button key={p.name} type="button" onClick={() => setSelectedPlatform(p)}
                        className={`rounded-xl px-4 py-3 text-xs font-medium border transition-all text-left flex items-center justify-between gap-3 ${
                          selectedPlatform.name === p.name
                            ? 'bg-brand/15 border-brand text-brand shadow-[0_0_14px_-4px] shadow-brand/30'
                            : 'border-border bg-background/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}>
                        <span className="font-semibold">{p.name}</span>
                        <span className={`text-[10px] font-mono shrink-0 rounded px-1.5 py-0.5 ${
                          selectedPlatform.name === p.name ? 'bg-brand/20 text-brand' : 'bg-border/50'
                        }`}>{p.label} · {p.ratio}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Step 2: Video Details ── */}
                <div className="flex flex-col gap-3">
                  <SectionLabel num={2}>Video Details</SectionLabel>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Video Title <span className="text-red-400 normal-case text-xs">*</span>
                    </label>
                    <input id="thumb-title" type="text" value={title} required
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. I Found Earth's Most Secret AI Location..."
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brief Video Summary / Script Concept</label>
                    <textarea id="thumb-desc" rows={2} value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Exploring how AI is being secretly used in government projects..."
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand resize-none" />
                  </div>

                  {/* Text callout — highlighted */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <span>Text Callout Overlay</span>
                      <span className="normal-case bg-brand/15 text-brand text-[10px] px-2 py-0.5 rounded-full font-semibold border border-brand/30">
                        Rendered in thumbnail
                      </span>
                    </label>
                    <input id="thumb-text" type="text" value={textOverlay}
                      onChange={(e) => setTextOverlay(e.target.value)}
                      placeholder="e.g. NOT REAL?! · BEAUTY RESET · $0 ➔ $1M"
                      className="w-full rounded-xl border border-brand/40 bg-background px-4 py-3 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand" />
                  </div>
                </div>

                {/* ── Step 3: Design Preferences ── */}
                <div className="flex flex-col gap-4">
                  <SectionLabel num={3}>Thumbnail Design Preferences</SectionLabel>
                  <ChipGroup label="Category / Niche" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
                  <ChipGroup label="Overall Aesthetic Style" options={STYLE_OPTIONS} value={style} onChange={setStyle} />
                  <ChipGroup label="Background Setup" options={BACKGROUND_OPTIONS} value={background} onChange={setBackground} />
                  <ChipGroup label="Graphic Annotations / Callouts" options={GRAPHIC_ELEMENTS} value={graphicEl} onChange={setGraphicEl} />
                  <ChipGroup label="Mood / Tone" options={MOOD_OPTIONS} value={mood} onChange={setMood} />
                </div>

                {/* ── Step 4: Face / Expression ── */}
                <div className="flex flex-col gap-3">
                  <SectionLabel num={4}>
                    <User2 className="size-3.5 text-brand" />
                    Subject Pose &amp; Facial Expression
                  </SectionLabel>
                  <ChipGroup label="Select Expression" options={FACE_EXPRESSION_OPTIONS} value={expression} onChange={setExpression} />
                </div>

                {/* ── Step 5: Add Your Photo ── */}
                <div className="flex flex-col gap-3">
                  <SectionLabel num={5}>
                    <Upload className="size-3.5 text-brand" />
                    Add Your Photo <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </SectionLabel>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Upload your photo to include your likeness as the main subject in the thumbnail.
                  </p>

                  {userPhotoPreview ? (
                    /* Photo preview */
                    <div className="relative rounded-xl border border-brand/40 bg-background/60 p-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={userPhotoPreview} alt="Your photo" className="size-16 rounded-lg object-cover shrink-0 border border-border" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">Photo uploaded ✓</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Your likeness will be used as the main subject</p>
                      </div>
                      <button type="button" onClick={removePhoto}
                        className="shrink-0 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    /* Upload drop zone */
                    <label htmlFor="photo-upload"
                      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 p-6 text-center cursor-pointer hover:border-brand/50 hover:bg-brand/5 transition-all group">
                      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-background group-hover:border-brand/40 group-hover:bg-brand/10 transition-all">
                        <Upload className="size-4 text-muted-foreground group-hover:text-brand transition-colors" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground group-hover:text-brand transition-colors">Click to upload your photo</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WEBP · Max 5MB</p>
                      </div>
                      <input ref={fileInputRef} id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp"
                        className="sr-only" onChange={handlePhotoUpload} />
                    </label>
                  )}
                </div>

                {/* Error */}
                {stage === 'error' && errorMsg && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-start gap-2">
                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                    <span><span className="font-semibold">Error: </span>{errorMsg}</span>
                  </div>
                )}

                <Button type="submit" disabled={!title.trim()} id="generate-thumb-btn"
                  className="w-full bg-brand text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/60 hover:bg-brand/90 py-5 text-sm font-semibold gap-2">
                  <Sparkles className="size-4" />
                  Generate Thumbnail
                  <ArrowRight className="size-4 ml-auto" />
                </Button>
              </form>
            )}

            {/* Generating spinner */}
            {stage === 'generating' && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 p-10 backdrop-blur-md text-center">
                <div className="relative size-14 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                  <LayoutTemplate className="size-5 text-brand animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Designing your thumbnail…</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Our AI is synthesizing a high-CTR design that follows every preference you set.
                  </p>
                </div>
                <div className="w-full rounded-xl border border-border bg-background/50 p-3 text-left">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Progress</p>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3 text-brand shrink-0" />Platform &amp; preferences locked in</div>
                    <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3 text-brand shrink-0" />Viral prop concept identified</div>
                    <div className="flex items-center gap-2 text-brand"><RefreshCw className="size-3 animate-spin shrink-0" />Rendering high-quality thumbnail…</div>
                  </div>
                </div>
              </div>
            )}

            {/* Done state */}
            {stage === 'done' && (
              <div className="flex flex-col gap-4 rounded-2xl border border-brand/30 bg-card/40 p-6 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-brand" />
                  <p className="text-sm font-semibold text-foreground">Thumbnail Generated!</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">What we did</p>
                  <div className="space-y-1 text-xs font-mono text-foreground">
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />All preferences strictly applied</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />Viral prop &amp; creative hook embedded</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />Text overlay rendered in image</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3 text-brand shrink-0" />{presetUsed.width} × {presetUsed.height} · {presetUsed.ratio} rendered</div>
                  </div>
                </div>
                {genaiBoost && (
                  <div className="rounded-xl border border-brand/20 bg-brand/5 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-brand mb-1">AI Creative Hook Used</p>
                    <p className="text-xs text-foreground leading-relaxed">{genaiBoost}</p>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Button onClick={handleDownload} id="download-thumb-btn"
                    className="w-full bg-brand text-brand-foreground hover:bg-brand/90 gap-2 text-sm font-semibold shadow-[0_0_20px_-4px] shadow-brand/60">
                    <Download className="size-4" />
                    Download Thumbnail
                  </Button>
                  <Button type="button" onClick={handleReset} variant="outline" id="new-thumb-btn"
                    className="w-full border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 text-xs">
                    <RotateCcw className="size-3.5" />
                    Generate another thumbnail
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Preview + AI concept ── */}
          <div className="lg:col-span-7 flex flex-col gap-4">

            {/* Dynamic aspect ratio preview box */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl flex items-center justify-center w-full"
              style={previewStyle}>
              {stage === 'done' && generatedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={generatedImage} alt="Generated thumbnail"
                  className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-4 text-center p-8">
                  {stage === 'generating' ? (
                    <>
                      <div className="relative size-16 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
                        <ImageIcon className="size-6 text-brand animate-pulse" />
                      </div>
                      <p className="font-semibold text-foreground">Rendering your thumbnail…</p>
                      <div className="w-full max-w-xs space-y-2 mt-1">
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-3/4" />
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-full" />
                        <div className="h-2.5 rounded-full bg-muted animate-pulse w-2/3" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex size-16 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
                        <LayoutTemplate className="size-8" />
                      </div>
                      <p className="font-semibold text-foreground">Thumbnail preview</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Fill in your details — your thumbnail will appear here in{' '}
                        <span className="text-brand font-semibold">{selectedPlatform.ratio}</span> format ({selectedPlatform.label}).
                      </p>
                      {/* Quick summary of active selections */}
                      <div className="mt-2 flex flex-wrap gap-1.5 justify-center max-w-xs">
                        {[category, style, mood].map((s) => (
                          <span key={s} className="text-[10px] rounded-full border border-border bg-background/60 px-2 py-0.5 text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* AI concept shown below */}
            {stage === 'done' && thumbnailPrompt && (
              <div className="rounded-2xl border border-brand/30 bg-card/50 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="size-3.5 text-brand" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">AI Thumbnail Concept Used</p>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    {presetUsed.name} · {presetUsed.ratio}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{thumbnailPrompt}</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  )
}

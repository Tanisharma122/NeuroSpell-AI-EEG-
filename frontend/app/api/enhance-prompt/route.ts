import { NextResponse } from 'next/server'

// ── Smart local prompt enhancer — always works, no API needed ─────────────────
// Detects the scene type and adds relevant cinematic/photography descriptors.

function detectSceneType(prompt: string): string {
  const p = prompt.toLowerCase()
  if (/\b(person|man|woman|girl|boy|face|portrait|human|people|model|character)\b/.test(p)) return 'portrait'
  if (/\b(city|street|urban|building|architecture|skyline|downtown|metropolis)\b/.test(p)) return 'urban'
  if (/\b(forest|mountain|ocean|lake|river|nature|landscape|sky|sunset|sunrise|beach|desert)\b/.test(p)) return 'landscape'
  if (/\b(food|coffee|drink|meal|plate|restaurant|café|kitchen)\b/.test(p)) return 'product-food'
  if (/\b(product|bottle|gadget|phone|laptop|device|tech|car|watch)\b/.test(p)) return 'product-tech'
  if (/\b(abstract|pattern|texture|art|digital|geometric|fractal|neon|glow)\b/.test(p)) return 'abstract'
  if (/\b(space|galaxy|nebula|stars|cosmos|universe|planet)\b/.test(p)) return 'space'
  if (/\b(fantasy|dragon|magic|castle|wizard|creature|mythical|epic)\b/.test(p)) return 'fantasy'
  return 'general'
}

function detectMoodLighting(prompt: string): string {
  const p = prompt.toLowerCase()
  if (/\b(golden|warm|sunset|sunrise|soft|cozy|autumn)\b/.test(p)) return 'warm golden hour lighting, sun rays, atmospheric haze'
  if (/\b(neon|night|dark|glow|cyber|futuristic|rain)\b/.test(p)) return 'dramatic neon lighting, deep shadows, cinematic noir ambiance'
  if (/\b(moody|dramatic|intense|storm|fog|mist)\b/.test(p)) return 'moody overcast lighting, deep contrast, dramatic shadows'
  if (/\b(bright|cheerful|vibrant|colorful|vivid)\b/.test(p)) return 'bright natural light, vivid saturation, clean exposure'
  if (/\b(studio|clean|minimal|white|crisp)\b/.test(p)) return 'professional studio lighting, soft boxes, clean white balance'
  if (/\b(mysterious|eerie|spooky|haunted|dark)\b/.test(p)) return 'low-key dramatic lighting, deep shadows, mysterious atmosphere'
  return 'cinematic three-point lighting, balanced exposure, professional color grading'
}

function buildEnhancedPrompt(rawPrompt: string): string {
  const sceneType = detectSceneType(rawPrompt)
  const lighting  = detectMoodLighting(rawPrompt)

  const qualityBase = 'ultra-detailed, 8K resolution, photorealistic, sharp focus'

  const sceneDescriptors: Record<string, string> = {
    portrait:
      `close-up portrait photography, shallow depth of field, beautiful bokeh background, ${lighting}, skin texture detail, editorial magazine quality, DSLR 85mm prime lens, ${qualityBase}`,
    urban:
      `wide-angle urban photography, architectural symmetry, ${lighting}, long exposure, reflections on wet pavement, dynamic composition, ${qualityBase}`,
    landscape:
      `sweeping landscape photography, panoramic vista, ${lighting}, rich color palette, foreground depth elements, rule of thirds composition, HDR tonal range, ${qualityBase}`,
    'product-food':
      `professional product photography, macro lens, styled food/beverage, soft studio lighting, shallow depth of field, ${lighting}, clean background, commercial quality, ${qualityBase}`,
    'product-tech':
      `sleek tech product photography, ${lighting}, reflective surfaces, premium feel, dark moody background, professional studio setup, ${qualityBase}`,
    abstract:
      `digital abstract art, intricate fractal details, ${lighting}, vibrant color contrast, fluid organic shapes, motion blur accents, ${qualityBase}`,
    space:
      `deep space photography, nebula glow, star field, ${lighting}, cosmic scale, NASA-quality render, volumetric light scattering, ${qualityBase}`,
    fantasy:
      `epic fantasy concept art, highly detailed environment, ${lighting}, dynamic composition, painterly quality, cinematic perspective, ${qualityBase}`,
    general:
      `${lighting}, professional photography, cinematic composition, high detail, ${qualityBase}`,
  }

  const descriptor = sceneDescriptors[sceneType] || sceneDescriptors.general
  return `${rawPrompt}, ${descriptor}`
}

// ── Retry helper ──────────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, baseDelayMs = 800): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 503 && res.status !== 429) return res
    if (attempt === maxRetries) return res
    await new Promise((r) => setTimeout(r, baseDelayMs * attempt))
  }
  return fetch(url, options)
}

export async function POST(req: Request) {
  let rawPrompt = ''
  try {
    const body = await req.json()
    rawPrompt = (body?.prompt || '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!rawPrompt) return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 })

  // ── Try Gemini first (optional bonus — if it works, great) ─────────────────
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean) as string[]

  for (const key of keys) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`
      const systemInstruction =
        'You are an expert AI image prompt engineer. Transform the user request ' +
        'into a highly detailed, visually descriptive prompt suitable for a text-to-image model. ' +
        'Include details on style, lighting, camera angle, texture, and composition. ' +
        'Return ONLY the enhanced prompt string without commentary or quote marks.'

      const res = await fetchWithRetry(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Expand this into a detailed visual prompt: "${rawPrompt}"` }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.7 },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        let enhanced = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
        enhanced = enhanced.replace(/^["']|["']$/g, '')
        if (enhanced) {
          return NextResponse.json({ enhancedPrompt: enhanced, fallback: false, source: 'gemini' })
        }
      }
    } catch {
      // silently try next key
    }
  }

  // ── Gemini unavailable → use smart local enhancement (always works) ─────────
  const localEnhanced = buildEnhancedPrompt(rawPrompt)
  return NextResponse.json({ enhancedPrompt: localEnhanced, fallback: false, source: 'local' })
}

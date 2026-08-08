import { NextResponse } from 'next/server'

const PLATFORM_PRESETS: Record<string, { width: number; height: number; ratio: string }> = {
  'YouTube Video Thumbnail':                    { width: 1280, height: 720,  ratio: '16:9' },
  'YouTube Shorts / Instagram Reels / TikTok': { width: 1080, height: 1920, ratio: '9:16' },
  'Instagram / LinkedIn Square Post':           { width: 1080, height: 1080, ratio: '1:1' },
  'Twitter / LinkedIn Banner':                  { width: 1200, height: 675,  ratio: '16:9' },
}

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const {
    title = '', description = '', platform = 'YouTube Video Thumbnail',
    category = '', style = '', background = '',
    graphic_element = '', mood = '', expression = '', text_overlay = '',
    user_image_base64 = '',
  } = body

  if (!title.trim()) return NextResponse.json({ error: 'Video title is required.' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY
  const hfToken  = process.env.HF_TOKEN
  if (!geminiKey || !hfToken) return NextResponse.json({ error: 'API keys missing.' }, { status: 500 })

  const preset      = PLATFORM_PRESETS[platform] ?? PLATFORM_PRESETS['YouTube Video Thumbnail']
  const hasUserImage = !!user_image_base64?.trim()
  const textOverlay  = text_overlay.trim()   // empty = no overlay requested

  // Smart placement (used later when we append text instruction ourselves)
  const isVertical = preset.ratio === '9:16'
  const isSquare   = preset.ratio === '1:1'
  const hasSubject = !expression.includes('No Face')

  const textPlacement = isVertical
    ? 'at the very top of the image (top 15%), centered horizontally'
    : isSquare
    ? 'in the upper-left corner, leaving the right side clear for the subject'
    : hasSubject
    ? 'in whichever upper corner (left or right) has the most empty sky/background — never over the face'
    : 'centered in the upper third of the image'

  // ── Step 1: Gemini – viral creative prop ───────────────────────────────────
  let genaiBoost = ''
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
    const r = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `Category: ${category}\nTitle: ${title}\nDescription: ${description}\nSuggest ONE viral visual prop or graphic hook for a thumbnail (e.g. "A glowing skin-care bottle", "A 3D $0→$1M arrow", "A floating UI dashboard"). Return only 1 concise sentence.` }],
        }],
      }),
    })
    if (r.ok) {
      const d = await r.json()
      genaiBoost = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    }
  } catch (e) { console.warn('Boost failed:', e) }

  // ── Step 2: Gemini – generate the VISUAL SCENE prompt (NO text overlay here)
  // We intentionally keep text overlay OUT of Gemini's job.
  // We will append it ourselves afterward → guarantees exactly ONE occurrence.
  const systemInstruction = `You are an elite YouTube Thumbnail Prompt Engineer writing prompts for FLUX.1, a text-to-image model.

CRITICAL INSTRUCTION: Do NOT mention any text overlay, typography, or written words in your output.
Your job is ONLY to describe the VISUAL SCENE: subject, background, lighting, mood, composition, graphic elements.
The caller will handle text overlay separately after you return.

QUALITY MANDATES (every prompt, no exceptions):
- 8K ultra-sharp photorealistic quality, DSLR professional camera
- Cinematic depth-of-field (bokeh) separating subject from background
- Studio-grade lighting perfectly matching the mood and category
- Hyper-detailed textures: skin pores, fabric weave, surface reflections
- Composition must feel like a $10,000 professional editorial photo shoot
- NO blurry, muddy, flat, or generic outputs

Output ONLY the visual scene prompt string. No text elements. No commentary. No quotes.`

  const visualScenePrompt = [
    `=== VISUAL SCENE REQUIREMENTS (ALL MANDATORY) ===`,
    `Platform: ${platform} (${preset.width}×${preset.height}, ${preset.ratio})`,
    `Video Title: "${title}"`,
    `Video Concept: ${description || 'Not specified'}`,
    `Category/Niche: ${category}`,
    `Aesthetic Style: ${style}`,
    `Background: ${background} — render exactly as described`,
    `Graphic Element: ${graphic_element} — include in composition`,
    `Mood: ${mood} — the whole image must radiate this emotion`,
    `Subject Pose & Expression: ${hasUserImage ? `Person from uploaded reference photo, pose: ${expression}` : expression}`,
    `Creative Prop: ${genaiBoost || 'A visually scroll-stopping focal element'}`,
    ``,
    `OUTPUT: Describe only the visual scene. NO text overlays, no typography, no written words.`,
  ].join('\n')

  let scenePrompt = ''
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
    const r = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: visualScenePrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: 0.75 },
      }),
    })
    if (r.ok) {
      const d = await r.json()
      scenePrompt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      scenePrompt = scenePrompt.replace(/^["']|["']$/g, '')
    }
  } catch (e) { console.warn('Scene synthesis failed:', e) }

  // Fallback visual scene
  if (!scenePrompt) {
    scenePrompt = [
      `Professional ${platform} visual for "${title}"`,
      `${style} aesthetic, ${background}`,
      `${mood} mood, ${graphic_element}`,
      `subject: ${expression}`,
      `8K photorealistic, cinematic lighting, professional photography`,
    ].join(', ')
  }

  // ── Step 3: Append text overlay EXACTLY ONCE (we own this, not Gemini) ─────
  let finalFluxPrompt = scenePrompt

  if (textOverlay) {
    // Sanitize: remove any text-like phrase Gemini may have sneaked in
    const overlayEscaped = textOverlay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const overlayRegex   = new RegExp(overlayEscaped, 'gi')
    finalFluxPrompt = finalFluxPrompt.replace(overlayRegex, '').replace(/,\s*,/g, ',').trim()

    // Now append ONE single precise instruction
    finalFluxPrompt +=
      `, with the text "${textOverlay}" appearing EXACTLY ONCE — rendered as cinematic` +
      ` editorial typography, clean condensed bold font, color matching the scene's ambient` +
      ` light, soft directional shadow (no thick cartoon outline), placed ${textPlacement},` +
      ` single instance only`
  }

  // ── Step 4: Render via HF Together ────────────────────────────────────────
  try {
    const hfUrl = 'https://router.huggingface.co/together/v1/images/generations'
    const hfRes = await fetch(hfUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: finalFluxPrompt,
        width:  preset.width,
        height: preset.height,
        num_inference_steps: 4,
        response_format: 'b64_json',
      }),
    })

    if (!hfRes.ok) {
      const errText = await hfRes.text()
      return NextResponse.json({ error: `Render failed (${hfRes.status}): ${errText}` }, { status: hfRes.status })
    }

    const result = await hfRes.json()
    const b64 = result?.data?.[0]?.b64_json
    if (!b64) return NextResponse.json({ error: 'No image data returned.' }, { status: 500 })

    return NextResponse.json({
      imageUri: `data:image/png;base64,${b64}`,
      thumbnailPrompt: finalFluxPrompt,
      genaiBoost,
      preset,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Thumbnail generation failed.' }, { status: 500 })
  }
}

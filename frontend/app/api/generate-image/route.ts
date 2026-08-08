import { NextResponse } from 'next/server'

// Uses HF Router → Together provider which supports FLUX.1-schnell
// Returns the image as base64 JSON (no external URL redirect needed)
export async function POST(req: Request) {
  try {
    const { enhancedPrompt, width = 1024, height = 1024 } = await req.json()
    if (!enhancedPrompt || typeof enhancedPrompt !== 'string' || !enhancedPrompt.trim()) {
      return NextResponse.json({ error: 'enhancedPrompt is required' }, { status: 400 })
    }

    const hfToken = process.env.HF_TOKEN
    if (!hfToken) {
      return NextResponse.json(
        { error: 'HF_TOKEN is missing in server configuration.' },
        { status: 500 }
      )
    }

    // Clamp size to multiples of 16 and within allowed range
    const safeW = Math.min(1920, Math.max(256, Math.round(Number(width) / 16) * 16))
    const safeH = Math.min(1920, Math.max(256, Math.round(Number(height) / 16) * 16))

    const hfUrl = 'https://router.huggingface.co/together/v1/images/generations'

    const hfResponse = await fetch(hfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: enhancedPrompt.trim(),
        width: safeW,
        height: safeH,
        num_inference_steps: 4,
        response_format: 'b64_json',
      }),
    })

    if (!hfResponse.ok) {
      const errText = await hfResponse.text()
      return NextResponse.json(
        { error: `Image generation failed (status ${hfResponse.status}): ${errText}` },
        { status: hfResponse.status }
      )
    }

    const result = await hfResponse.json()
    const b64 = result?.data?.[0]?.b64_json
    if (!b64) {
      return NextResponse.json(
        { error: 'No image data returned from generation API.' },
        { status: 500 }
      )
    }

    const imageUri = `data:image/png;base64,${b64}`
    return NextResponse.json({ imageUri })
  } catch (error: any) {
    console.error('Error generating image:', error)
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

import type { Metadata } from 'next'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { FeatureSubmenu } from '@/components/feature-submenu'
import { TextToImageWorkspace } from '@/components/features/text-to-image-workspace'

export const metadata: Metadata = {
  title: 'In-Video Text-to-Image — CreaTect AI',
  description:
    'Generate high-quality visual assets on the fly for your timelines. Refine prompts with an integrated LLM for seamless B-roll, overlays, and storyboarding.',
}

export default function TextToImagePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav simplified />
      <FeatureSubmenu active="/features/text-to-image" />
      <main className="flex-1">
        <TextToImageWorkspace />
      </main>
      <SiteFooter />
    </div>
  )
}

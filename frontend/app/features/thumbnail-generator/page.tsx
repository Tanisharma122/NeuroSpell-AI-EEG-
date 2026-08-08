import type { Metadata } from 'next'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { FeatureSubmenu } from '@/components/feature-submenu'
import { ThumbnailWorkspace } from '@/components/features/thumbnail-workspace'

export const metadata: Metadata = {
  title: 'AI Thumbnail Generator — CreaTect AI',
  description:
    'Enter your video title and hook, choose a style and mood — our AI designs a scroll-stopping high-CTR thumbnail in seconds.',
}

export default function ThumbnailGeneratorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav simplified />
      <FeatureSubmenu active="/features/thumbnail-generator" />
      <main className="flex-1">
        <ThumbnailWorkspace />
      </main>
      <SiteFooter />
    </div>
  )
}

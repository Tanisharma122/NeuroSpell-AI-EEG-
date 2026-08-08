import type { Metadata } from 'next'
import Image from 'next/image'
import { Play, Repeat, TrendingUp, Flame } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { FeatureSubmenu } from '@/components/feature-submenu'
import { FeatureSection } from '@/components/features/feature-section'

export const metadata: Metadata = {
  title: 'AI Video Clipping & Distribution — CreaTect AI',
  description:
    'Identify high-engagement segments to create viral shorts and reels. Analyze long-form video, generate metadata, and distribute everywhere in one click.',
}

function VideoClippingVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="relative aspect-video">
        <Image
          src="/podcast-host.png"
          alt="A person speaking at a podcast desk"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-background/70 via-transparent to-transparent" />

        <button
          type="button"
          aria-label="Play clip"
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand/90 text-brand-foreground shadow-[0_0_36px_-4px] shadow-brand transition-transform hover:scale-105"
        >
          <Play className="ml-1 size-5" aria-hidden="true" />
        </button>

        {/* Floating profile card */}
        <div className="absolute left-4 top-4 flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 backdrop-blur-md">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
            JB
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">John Bright</p>
            <p className="text-xs text-muted-foreground">Host</p>
          </div>
        </div>

        {/* Data card */}
        <div className="absolute bottom-4 left-4 w-56 space-y-3 rounded-xl border border-brand/40 bg-background/80 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-4 text-brand" aria-hidden="true" />
              Potential Virality Score
            </span>
            <span className="text-sm font-bold text-brand">88%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-[88%] rounded-full bg-brand" />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Flame className="size-4 text-brand" aria-hidden="true" />
              Viral Hooks Detected
            </span>
            <span className="text-sm font-bold text-foreground">5</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VideoClippingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav simplified />
      <FeatureSubmenu active="/features/video-clipping" />
      <main className="flex-1">
        <FeatureSection
          eyebrow="Video Repurposing Engine"
          eyebrowIcon={Repeat}
          headline="Identify high-engagement segments to create viral shorts and reels."
          subtext="Analyze long-form video, generate metadata (titles, tags, descriptions), and distribute to YouTube, Instagram, TikTok, and LinkedIn in one click."
          ctaLabel="Learn more"
          visual={<VideoClippingVisual />}
        />
      </main>
      <SiteFooter />
    </div>
  )
}

import Link from 'next/link'
import { Scissors, ImageIcon, LayoutTemplate } from 'lucide-react'

const tabs = [
  { label: 'Video Clipping', href: '/features/video-clipping', icon: Scissors },
  { label: 'Text-to-Image', href: '/features/text-to-image', icon: ImageIcon },
  { label: 'Thumbnail Gen', href: '/features/thumbnail-generator', icon: LayoutTemplate },
]

export function FeatureSubmenu({ active }: { active: string }) {
  return (
    <div className="border-b border-border/60 bg-card/40">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2">
        {tabs.map((tab) => {
          const isActive = tab.href === active
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand text-brand-foreground shadow-[0_0_18px_-6px] shadow-brand/70'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

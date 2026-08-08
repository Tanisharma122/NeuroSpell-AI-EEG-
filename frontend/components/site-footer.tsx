import Link from 'next/link'
import { Logo } from '@/components/site-nav'

const columns = [
  {
    title: 'Products',
    links: ['BCI Speller', 'Emergency Alerts', 'Smart Home Control', 'LLM Predictor'],
  },
  {
    title: 'Research',
    links: ['EEGNet Model', 'P300 Dataset', 'Publications', 'GitHub'],
  },
  {
    title: 'Resources',
    links: ['Docs', 'Changelog', 'Community', 'Support'],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Agentic P300 BCI platform for paralyzed patients. Translate brainwaves into speech, emergency alerts, and smart home control.
          </p>
          {/* Platform footer stats */}
          <div className="mt-6 flex flex-col gap-2">
            {[
              '18-Subject Deep Learning (s01–s18)',
              '< 100ms Inference Latency',
              '92.4% Character Accuracy',
              '0-Shot Calibration Free',
            ].map((stat) => (
              <span key={stat} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand" />
                {stat}
              </span>
            ))}
          </div>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="mb-4 text-sm font-semibold text-foreground">{col.title}</h3>
            <ul className="space-y-3">
              {col.links.map((link) => (
                <li key={link}>
                  <Link
                    href="/#suite"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} NeuroSpell AI. All rights reserved.</p>
          <p>Empowering paralyzed lives with P300 neurotechnology.</p>
        </div>
      </div>
    </footer>
  )
}

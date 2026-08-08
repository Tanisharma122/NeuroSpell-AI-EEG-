import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="relative overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-brand/25 via-card to-card px-6 py-16 text-center sm:px-12 lg:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/30 blur-[120px]"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Ready to give paralyzed patients their voice back?
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Deploy NeuroSpell AI at bedside — zero calibration, 92.4% accuracy, real-time BCI communication from day one.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              render={<Link href="/#suite" />}
              nativeButton={false}
              size="lg"
              className="bg-brand text-brand-foreground shadow-[0_0_32px_-6px] shadow-brand/70 hover:bg-brand/90"
            >
              Start Spelling for Free
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

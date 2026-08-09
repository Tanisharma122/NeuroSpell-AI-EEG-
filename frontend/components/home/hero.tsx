import Image from 'next/image'
import Link from 'next/link'
import { Play, Sparkles, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* subtle glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        {/* Left */}
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
            ✨ AI-Powered P300 Neurotechnology OS
          </span>
          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Empowering Paralyzed Lives with Agentic BCI Orchestration.
          </h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            One platform to translate raw P300 brainwaves into real-time speech, emergency caregiver alerts, and smart home automation using 18-subject deep learning.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              render={<Link href="/#suite" />}
              nativeButton={false}
              size="lg"
              className="bg-brand text-brand-foreground shadow-[0_0_28px_-6px] shadow-brand/70 hover:bg-brand/90"
            >
              Start Spelling
            </Button>
            <Button
              render={<Link href="/#suite" />}
              nativeButton={false}
              size="lg"
              variant="outline"
              className="border-border bg-transparent text-foreground hover:bg-secondary"
            >
              <Play className="size-4" aria-hidden="true" />
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Right — NeuroSpell HUD */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* Top Header Bar */}
            <div className="flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-2.5">
              <span className="font-mono text-[11px] font-semibold tracking-wider text-brand">
                NeuroSpell AI HUD
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="size-2 rounded-full bg-green-400 shadow-[0_0_6px_1px_rgba(74,222,128,0.8)]" />
                  Live LSL Stream
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">512 Hz</span>
                <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] text-brand">
                  eegnet_p300.pt
                </span>
              </div>
            </div>

            <div className="relative aspect-video">
              <video 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="absolute inset-0 w-full h-full object-cover"
              >
                <source src="/hero-video.mp4" type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />

              {/* BCI activity overlay */}
              <div className="absolute right-6 top-6 flex flex-col items-end gap-2">
                <div className="relative flex size-20 items-center justify-center">
                  <div className="absolute inset-0 rounded-md border-2 border-brand/70" />
                  <div className="absolute inset-0 rounded-md border-2 border-brand/70 [clip-path:polygon(0_0,30%_0,30%_8%,8%_8%,8%_30%,0_30%)]" />
                  <Activity className="size-6 text-brand" aria-hidden="true" />
                </div>
                <span className="rounded-md bg-background/80 px-2 py-1 font-mono text-[10px] tracking-widest text-brand backdrop-blur">
                  P300 SIGNAL ACTIVE
                </span>
              </div>
            </div>

            {/* Bottom Status Bar */}
            <div className="flex items-center justify-center border-t border-border/60 bg-card/80 px-4 py-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                PyTorch EEGNet (s01–s18) &nbsp;|&nbsp; Accuracy: <span className="text-brand font-semibold">92.4%</span> &nbsp;|&nbsp; ITR: <span className="text-brand font-semibold">24.5 bits/min</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

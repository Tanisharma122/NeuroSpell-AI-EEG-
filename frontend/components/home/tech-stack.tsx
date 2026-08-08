import { Cpu, Network, ShieldCheck } from 'lucide-react'

const pillars = [
  {
    icon: Cpu,
    title: 'PyTorch EEGNet Deep Learning',
    desc: 'A compact, depthwise-separable CNN architecture purpose-built for EEG classification, trained from scratch on 18 subjects with subject-independent generalization.',
  },
  {
    icon: Network,
    title: 'Agentic BCI Orchestration',
    desc: 'LLM word prediction, TTS synthesis, Twilio SMS dispatch, and IoT smart home commands are coordinated as autonomous agents from a single decoded intent.',
  },
  {
    icon: ShieldCheck,
    title: 'Zero-Shot Calibration-Free',
    desc: 'No per-user calibration required at deployment. The model generalizes across unseen subjects — making it immediately usable at bedside without setup delays.',
  },
]

export function TechStack() {
  return (
    <section id="tech" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="overflow-hidden rounded-3xl border border-brand/30 bg-card p-8 sm:p-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
          Research Architecture
        </span>
        <h2 className="mt-5 max-w-2xl text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Built on a validated, multi-agent BCI architecture.
        </h2>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          NeuroSpell AI combines PyTorch deep learning with coordinated agentic outputs — translating a single P300 event into speech, emergency alerts, or smart home commands with enterprise reliability.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon
            return (
              <div key={pillar.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-6">
                <span className="flex size-11 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-semibold text-foreground">{pillar.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{pillar.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

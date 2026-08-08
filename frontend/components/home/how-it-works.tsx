import { Brain, Wand2, Send } from 'lucide-react'

const steps = [
  {
    step: '01',
    icon: Brain,
    title: 'Stream & Detect P300',
    desc: 'Connect EEG headset via Lab Streaming Layer (LSL) at 512 Hz. NeuroSpell captures live 8-channel brainwave signals and isolates the P300 event-related potential in real time.',
  },
  {
    step: '02',
    icon: Wand2,
    title: 'Classify & Predict',
    desc: 'PyTorch EEGNet — trained on 18 subjects (s01–s18) — classifies target vs. non-target epochs at 92.4% accuracy. An LLM predicts the next word from context to reduce spelling effort by 80%.',
  },
  {
    step: '03',
    icon: Send,
    title: 'Act & Communicate',
    desc: 'Decoded intent is instantly routed to the correct output: voice synthesis via Web Speech API, emergency SMS via Twilio, or IoT command to smart home devices — all with sub-100ms latency.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">How it works</p>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From raw brainwave to real-world action in three steps.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.step}
                className="relative flex flex-col gap-4 rounded-2xl border border-border bg-background/60 p-8"
              >
                <span className="absolute right-6 top-6 font-mono text-4xl font-bold text-brand/20">
                  {item.step}
                </span>
                <span className="flex size-12 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="text-pretty leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

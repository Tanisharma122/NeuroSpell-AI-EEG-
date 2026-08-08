import Image from 'next/image'
import Link from 'next/link'
import { MessageSquare, Siren, Home, ArrowRight, Check } from 'lucide-react'

const features = [
  {
    eyebrow: 'BCI Communication Engine',
    icon: MessageSquare,
    title: 'BCI Speller & Predictive LLM',
    desc: 'Real-time 6x6 alphanumeric matrix speller powered by deep neural networks. Features a context-aware LLM word completion top-row that reduces typing latency by 80%, paired with an instant Web Speech Text-to-Speech (TTS) voice synthesizer.',
    points: ['6x6 Matrix Speller', 'LLM Word Predictor', 'Web Speech TTS'],
    href: '/#features',
    image: '/podcast-host.png',
    imageAlt: 'NeuroSpell BCI P300 speller matrix with EEG signal visualization and LLM prediction chips',
    badges: ['6x6 Matrix', 'LLM Predictor', 'Web Speech TTS'],
  },
  {
    eyebrow: 'Nurse Emergency Alert System',
    icon: Siren,
    title: 'Emergency Caregiver Dispatch',
    desc: 'A hands-free, 1-step panic alert trigger designed for immediate medical care. Features automated Twilio SMS notifications to family/nurses, in-room audible chime alarms, and categorized quick-request tiles (Need Water, High Pain, Adjust Position).',
    points: ['1-Click Panic Alert', 'Twilio SMS API Integration', 'Categorized Patient Needs'],
    href: '/#features',
    image: '/futuristic-city-rain.png',
    imageAlt: 'Emergency caregiver alert dashboard with panic button and SMS notification interface',
    badges: ['1-Click Panic', 'Twilio SMS API', 'Categorized Needs'],
  },
  {
    eyebrow: 'Smart Home & Environmental Controls',
    icon: Home,
    title: 'Neurotech Home Automation',
    desc: 'Direct brainwave command interface connected to IoT smart home systems. Enables non-verbal patients to adjust room lighting, control smart thermostats, operate motorized hospital bed positioning, and trigger audio/video entertainment.',
    points: ['Smart Lighting Control', 'Bed & Thermostat Automation', 'Climate & Media Control'],
    href: '/#features',
    image: '/thumb-face.png',
    imageAlt: 'Smart home IoT control panel driven by P300 brainwave commands',
    badges: ['Smart Lighting', 'Bed Positioning', 'Climate & Media'],
  },
]

export function FeatureDeepDives() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Module Deep Dives</p>
        <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Every critical need, orchestrated by P300 brainwave AI.
        </h2>
      </div>

      <div className="mt-16 flex flex-col gap-20 lg:gap-28">
        {features.map((feature, index) => {
          const Icon = feature.icon
          const reversed = index % 2 === 1
          return (
            <div
              key={feature.title}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              {/* Text */}
              <div className={reversed ? 'lg:order-2' : ''}>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {feature.eyebrow}
                </span>
                <h3 className="mt-5 text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{feature.desc}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-center gap-3 text-sm text-foreground">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand/15 text-brand">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                {/* Badges */}
                <div className="mt-6 flex flex-wrap gap-2">
                  {feature.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1 font-mono text-xs text-brand"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <Link
                  href={feature.href}
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:text-brand/80"
                >
                  Explore module
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>

              {/* Visual */}
              <div className={reversed ? 'lg:order-1' : ''}>
                <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                  <div className="relative aspect-video">
                    <Image src={feature.image} alt={feature.imageAlt} fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

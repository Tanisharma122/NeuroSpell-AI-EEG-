import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

const tiers = [
  {
    name: 'Research Free',
    price: '$0',
    cadence: '/mo',
    desc: 'For researchers and students exploring BCI.',
    features: [
      'P300 speller demo (offline)',
      'EEGNet model access',
      '6x6 matrix simulator',
      'Community support',
    ],
    cta: 'Start Free',
    featured: false,
  },
  {
    name: 'Clinical Pro',
    price: '$49',
    cadence: '/mo',
    desc: 'For hospitals and assistive care providers.',
    features: [
      'Live LSL stream integration',
      'Twilio SMS emergency alerts',
      'Smart home IoT commands',
      'LLM word prediction',
      'Web Speech TTS synthesis',
      'Priority clinical support',
    ],
    cta: 'Start Clinical Trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    desc: 'For healthcare networks and research labs at scale.',
    features: [
      'Everything in Clinical Pro',
      'Custom EEGNet fine-tuning',
      'Multi-patient dashboards',
      'EHR system integration',
      'Dedicated BCI engineer',
      'SLA & compliance (HIPAA)',
    ],
    cta: 'Contact Sales',
    featured: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Pricing</p>
        <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Flexible plans that scale with your clinical needs.
        </h2>
      </div>

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              tier.featured
                ? 'border-brand bg-card shadow-[0_0_50px_-12px] shadow-brand/50'
                : 'border-border bg-background/60'
            }`}
          >
            {tier.featured && (
              <span className="absolute -top-3 left-8 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{tier.desc}</p>
            <div className="mt-6 flex items-end gap-1">
              <span className="text-4xl font-bold tracking-tight text-foreground">{tier.price}</span>
              <span className="mb-1 text-sm text-muted-foreground">{tier.cadence}</span>
            </div>
            <ul className="mt-8 flex flex-col gap-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              render={<Link href="/#suite" />}
              nativeButton={false}
              className={`mt-8 w-full ${
                tier.featured
                  ? 'bg-brand text-brand-foreground shadow-[0_0_24px_-6px] shadow-brand/70 hover:bg-brand/90'
                  : 'border border-border bg-transparent text-foreground hover:bg-secondary'
              }`}
            >
              {tier.cta}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

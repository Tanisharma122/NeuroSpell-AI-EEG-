const testimonials = [
  {
    quote:
      'NeuroSpell gave my ALS patients a voice again. The P300 speller works right out of the box with no calibration — something we\'ve never seen before at this accuracy level.',
    name: 'Dr. Ananya Sharma',
    role: 'Neurologist, AIIMS',
    stat: '92.4% accuracy validated',
    initials: 'AS',
  },
  {
    quote:
      'The emergency alert module has been life-changing for ICU care. Our nurses receive Twilio SMS within milliseconds of a patient triggering the panic alert.',
    name: 'Rajiv Mehta',
    role: 'ICU Head Nurse',
    stat: 'Sub-100ms alert latency',
    initials: 'RM',
  },
  {
    quote:
      'Being able to control my lights, TV and thermostat just by focusing on letters — it restores dignity and independence. NeuroSpell is the future of assistive tech.',
    name: 'Priya Nair',
    role: 'ALS Patient, Beneficiary',
    stat: '0-shot calibration free',
    initials: 'PN',
  },
]

export function Testimonials() {
  return (
    <section id="testimonials" className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Clinical Impact Stories</p>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Trusted by clinicians and patients restoring independence.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((item) => (
            <figure
              key={item.name}
              className="flex flex-col gap-6 rounded-2xl border border-border bg-background/60 p-8"
            >
              <blockquote className="text-pretty leading-relaxed text-foreground">
                {`"${item.quote}"`}
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {item.initials}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.role} · {item.stat}
                  </p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

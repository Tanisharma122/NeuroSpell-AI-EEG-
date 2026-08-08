import Image from 'next/image'

interface TeamMember {
  name: string
  image: string | null
}

const members: TeamMember[] = [
  { name: 'Tanisha Sharma', image: '/tanisha-sharma.jpg' },
  { name: 'Jeneesh Vandra', image: null },
]

export function TeamSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24" id="team">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Meet the Team
        </h2>
        <p className="mt-3 text-muted-foreground text-lg">
          The people behind TANI
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-10">
        {members.map((member) => (
          <div
            key={member.name}
            className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-10 py-8 w-56 shadow-sm"
          >
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-brand/40 bg-muted">
              {member.image ? (
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-muted-foreground select-none">
                  {member.name.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-center text-base font-semibold text-foreground leading-snug">
              {member.name}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

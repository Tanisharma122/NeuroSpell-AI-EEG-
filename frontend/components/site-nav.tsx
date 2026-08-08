import Link from 'next/link'
import { Button } from '@/components/ui/button'

const navLinks = [
  { label: 'BCI Speller', href: '/features/bci-speller' },
  { label: 'Products', href: '/#suite' },
  { label: 'Solutions', href: '/#how-it-works' },
  { label: 'Modules', href: '/#features' },
  { label: 'Research', href: '/#tech' },
]

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-base font-bold text-brand-foreground">
        N
      </span>
      <span className="text-lg font-semibold tracking-tight text-foreground">NeuroSpell AI</span>
    </Link>
  )
}

export function SiteNav({ simplified = false }: { simplified?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />

        {!simplified && (
          <ul className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          {!simplified && (
            <Link
              href="/#suite"
              className="hidden text-sm text-foreground transition-colors hover:text-muted-foreground sm:block"
            >
              Login
            </Link>
          )}
          <Button
            render={<Link href="/#suite" />}
            nativeButton={false}
            className="bg-brand text-brand-foreground shadow-[0_0_20px_-4px] shadow-brand/60 hover:bg-brand/90"
          >
            Get Started
          </Button>
        </div>
      </nav>
    </header>
  )
}

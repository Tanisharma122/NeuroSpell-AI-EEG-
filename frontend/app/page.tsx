import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/home/hero'
import { SocialProof } from '@/components/home/social-proof'
import { FeatureSuite } from '@/components/home/feature-suite'
import { FeatureDeepDives } from '@/components/home/feature-deep-dives'
import { HowItWorks } from '@/components/home/how-it-works'
import { TechStack } from '@/components/home/tech-stack'
import { Testimonials } from '@/components/home/testimonials'
import { Pricing } from '@/components/home/pricing'
import { FinalCta } from '@/components/home/final-cta'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <FeatureSuite />
        <FeatureDeepDives />
        <HowItWorks />
        <TechStack />
        <Testimonials />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}

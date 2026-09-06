import { Link } from 'react-router-dom'
import { Flame, Users, Trophy, Target, ArrowRight, Star, Zap, Shield } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const features = [
  {
    icon: Users,
    title: 'Rooms',
    description: 'Join habit rooms where everyone keeps each other accountable. Collective stakes beat willpower every time.',
    color: '#6366F1',
  },
  {
    icon: Flame,
    title: 'Streaks',
    description: 'Check in daily to keep your streak alive. Miss one day and watch the flame flicker. But you can always reignite.',
    color: '#F97316',
  },
  {
    icon: Trophy,
    title: 'Compete',
    description: 'Climb the room leaderboard and the global rankings. XP, levels, and badges reward your consistency.',
    color: '#F59E0B',
  },
  {
    icon: Target,
    title: 'Track',
    description: 'Personal habits too? Sure. Track solo goals alongside your rooms. Best of both worlds.',
    color: '#22C55E',
  },
]

const testimonials = [
  { name: 'Beta Tester', role: 'Hackathon Participant', text: 'The room feature kept me accountable during a 48-hour build sprint. Way better than going solo.' },
  { name: 'Early Adopter', role: 'Live Beta User', text: 'Set up a streak room with my study group. We actually showed up every day this week.' },
  { name: 'Demo Viewer', role: 'Hackathon Preview', text: 'The leaderboard is surprisingly addictive. Already planning to build a room for my gym habit.' },
]

const socialProof = [
  { value: 'Beta', label: 'Live Preview' },
  { value: 'Hackathon', label: 'Demo Mode' },
  { value: 'Early', label: 'Access' },
  { value: 'v1.1', label: 'Release' },
]

export function Landing() {
  const [mounted, setMounted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setMounted(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []
    const particleCount = 60

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      })
    }

    let animId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`
        ctx.fill()
      })

      // Draw connecting lines
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      animId = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none opacity-40"
        style={{ zIndex: 0 }}
      />

      {/* Gradient Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
        zIndex: 0,
      }} />

      {/* Nav */}
      <nav className="relative z-10 border-b border-border" style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(13, 13, 15, 0.8)' }}>
        <div className="container-page">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-warning flex items-center justify-center">
                <Flame className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-text">StreakSync</span>
            </div>
            <Link
              to="/auth"
              className="btn btn-primary text-sm"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 container-page pt-24 pb-20">
        <div className={`max-w-4xl mx-auto text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border mb-8" style={{ backgroundColor: 'rgba(22, 22, 26, 0.8)' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-sm text-muted">Hackathon Preview — Live Beta</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6">
            <span className="block text-5xl md:text-7xl font-bold leading-[1.05]" style={{ color: '#F4F4F5' }}>
              Don't Break
            </span>
            <span className="block text-5xl md:text-7xl font-bold leading-[1.05] mt-1" style={{ color: '#F97316' }}>
              the Streak
            </span>
          </h1>

          {/* Sub */}
          <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            Join habit rooms. Check in daily. Build collective streaks with people who hold you accountable. Solo apps die in a week — this will not.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="btn btn-accent text-base px-8 py-3.5"
            >
              Start Your Streak
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/auth"
              className="btn btn-ghost text-base px-8 py-3.5"
            >
              Browse Rooms
            </Link>
          </div>
        </div>

        {/* Hero Visual - Room Cards Preview */}
        <div className={`mt-16 max-w-3xl mx-auto transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl shadow-black/50" style={{ backdropFilter: 'blur(20px)' }}>
              {/* Room Preview */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-2xl">💻</div>
                <div className="flex-1">
                  <div className="font-semibold text-text">100 Days of Code</div>
                  <div className="text-sm text-muted">12 members · 47 day streak</div>
                </div>
                <div className="text-2xl">🔥</div>
              </div>
              {/* Streak bar */}
              <div className="h-2 bg-border rounded-full overflow-hidden mb-4">
                <div className="h-full rounded-full" style={{ width: '47%', background: 'linear-gradient(90deg, #F97316, #F59E0B)' }} />
              </div>
              {/* Members row */}
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {['A', 'B', 'C', 'D', 'E'].map((l, i) => (
                    <div key={i} className="w-7 h-7 rounded-full border-2 border-surface flex items-center justify-center text-xs font-bold" style={{ backgroundColor: ['#6366F1', '#F97316', '#22C55E', '#F59E0B', '#8B5CF6'][i] }}>
                      {l}
                    </div>
                  ))}
                  <div className="w-7 h-7 rounded-full border-2 border-surface bg-border flex items-center justify-center text-xs text-muted">+7</div>
                </div>
                <button className="px-4 py-1.5 bg-success text-white text-sm font-semibold rounded-full">
                  Checked In ✓
                </button>
              </div>
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 bg-surface border border-border rounded-xl px-4 py-2 shadow-lg">
              <div className="text-xs text-muted">Your streak</div>
              <div className="text-lg font-bold text-accent">🔥 23 days</div>
            </div>
            <div className="absolute -bottom-4 -left-4 bg-surface border border-border rounded-xl px-4 py-2 shadow-lg">
              <div className="text-xs text-muted">Global Rank</div>
              <div className="text-lg font-bold text-text">#142</div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="relative z-10 border-y border-border" style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(22, 22, 26, 0.6)' }}>
        <div className="container-page py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {socialProof.map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-text mb-1">{item.value}</div>
                <div className="text-sm text-muted">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 container-page py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built different</h2>
          <p className="text-muted max-w-lg mx-auto text-lg">
            Most habit apps assume you have willpower. We assume you have friends who will call you out.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {features.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="card card-interactive group"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${feature.color}20`, color: feature.color }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-text text-lg mb-1">{feature.title}</h3>
                    <p className="text-muted text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 container-page pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Early feedback</h2>
          <p className="text-sm text-muted">From beta testers and hackathon participants</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {testimonials.map((t, idx) => (
            <div key={idx} className="card">
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-text text-sm leading-relaxed mb-4">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-text">{t.name}</div>
                  <div className="text-xs text-muted">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 container-page pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border" style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(249, 115, 22, 0.15) 100%)',
        }}>
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full border border-primary/20" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full border border-accent/20" />

          <div className="relative p-12 md:p-16 text-center">
            <div className="text-5xl mb-6">🔥</div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your streak starts today
            </h2>
            <p className="text-muted text-lg max-w-md mx-auto mb-8">
              Built during a hackathon. Join the early beta and help shape the future of social habit tracking.
            </p>
            <Link
              to="/auth"
              className="btn btn-accent text-base px-8 py-3.5"
            >
              Create Free Account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-success" /> No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-warning" /> Setup in 2 minutes
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border" style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(13, 13, 15, 0.8)' }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto px-6 py-6">
          {/* Left side - Brand */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-accent to-warning flex items-center justify-center">
              <Flame className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-text text-sm">StreakSync</span>
            <span className="text-muted text-xs">·</span>
            <span className="text-xs text-muted">Social Habit Accountability Platform</span>
          </div>

          {/* Right side - Credit */}
          <p className="text-xs text-muted">
            Built with <span className="text-danger">❤️</span> by{' '}
            <a
              href="https://www.linkedin.com/in/sameer-challa/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 underline-offset-2 hover:underline transition-colors"
            >
              Sameer Challa
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
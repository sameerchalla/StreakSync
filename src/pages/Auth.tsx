import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Flame, Mail, Eye, EyeOff, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { getBrowserTimezone } from '../lib/timezone'

type AuthMode = 'login' | 'signup'

export function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        // Sanitize username first
        const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '')

        // Validate sanitized username
        if (sanitizedUsername.length < 3) {
          setError('Username must be at least 3 characters (letters, numbers, underscores only).')
          setLoading(false)
          return
        }

        // Check if username is already taken BEFORE creating auth user
        // to avoid orphan auth users
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', sanitizedUsername)
          .maybeSingle()

        if (existingUser) {
          setError(`Username "${sanitizedUsername}" is already taken. Please choose another.`)
          setLoading(false)
          return
        }

        // Sign up new user
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: sanitizedUsername,
              display_name: username.trim().slice(0, 50),
            },
          },
        })

        if (signUpError) throw signUpError

        if (data.user) {
          // The database trigger `handle_new_user()` automatically creates a profile
          // when an auth user is created. We use upsert here so:
          // 1. If the trigger already created the profile, upsert will just update display_name
          // 2. If the trigger didn't fire (e.g. disabled), this creates the profile
          // 3. It's idempotent - safe to call multiple times
          const sanitizedDisplayName = username.trim().slice(0, 50)
          const browserTz = getBrowserTimezone()
          const { error: profileError } = await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              username: sanitizedUsername,
              display_name: sanitizedDisplayName,
              timezone: browserTz,
            },
            { onConflict: 'id' }
          )

          if (profileError) {
            // Only treat as a real error if it's NOT a unique violation on username
            // (23505 on username means the trigger already created a profile with the same
            // username for someone else, but that's extremely unlikely given our pre-check)
            if (profileError.code === '23505' && profileError.message?.includes('username')) {
              setError('Username already taken. Please choose another.')
              return
            }
            // Any other error: log it but still consider signup successful since
            // the auth user was created and the trigger should have created the profile
            console.error('Profile upsert error:', profileError)
          }

          setMessage('Account created successfully! You can now sign in.')
          setMode('login')
        }
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        navigate('/dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setError('')
    setLoading(true)

    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (googleError) throw googleError
    } catch (err: any) {
      setError(err.message || 'Google sign in failed')
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email first')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (magicError) throw magicError

      setMessage('Check your email for a magic link!')
    } catch (err: any) {
      setError(err.message || 'Magic link failed')
    } finally {
      setLoading(false)
    }
  }

  // Compute form validity based on active mode
  const isFormValid = (() => {
    if (mode === 'signup') {
      const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
      return (
        sanitizedUsername.length >= 3 &&
        email.length > 0 &&
        password.length >= 6
      )
    }
    return email.length > 0 && password.length >= 6
  })()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary to-accent p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 text-white">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur">
              <Flame className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">StreakSync</span>
          </div>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Don't Break<br />the Streak
          </h1>
          <p className="text-white/80 text-lg max-w-md">
            Join thousands who turned habit tracking into a social experience.
            Accountability beats willpower every time.
          </p>

          <div className="flex items-center gap-4 text-white/60 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <span>10,000+ Active Streakers</span>
            </div>
          </div>
        </div>

        <div className="text-white/40 text-sm">
          "Finally an app that keeps me accountable. My streak is 47 days and counting!"
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-accent">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-text">StreakSync</span>
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-surface rounded-lg p-1 mb-8">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={clsx(
                'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                mode === 'login' ? 'bg-primary text-white' : 'text-muted hover:text-text'
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={clsx(
                'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                mode === 'signup' ? 'bg-primary text-white' : 'text-muted hover:text-text'
              )}
            >
              Sign Up
            </button>
          </div>

          {/* Error/Message */}
          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-6 p-4 bg-success/10 border border-success/20 rounded-lg text-success text-sm">
              {message}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-text mb-2">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="streakmaster"
                  required
                  minLength={3}
                  maxLength={20}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                />
                {username && (
                  <p className="mt-1 text-xs text-muted">
                    Your username will be: <span className="font-mono text-text">@{username.toLowerCase().replace(/[^a-z0-9_]/g, '') || '(empty - add letters/numbers)'}</span>
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full py-3 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-muted">or continue with</span>
            </div>
          </div>

          {/* Social Auth */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full py-3 bg-surface border border-border rounded-lg text-text font-medium hover:bg-border transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Magic Link */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              className="w-full mt-4 py-2 text-sm text-muted hover:text-primary transition-colors"
            >
              Send me a magic link instead
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
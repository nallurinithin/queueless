import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Lock, Eye, EyeOff } from 'lucide-react';

export function StaffLogin() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);

    try {
      const authUser = await login(email, password);
      if (authUser?.redirectPath) {
        navigate(authUser.redirectPath);
      } else {
        navigate('/staff/owner');
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <Card className="max-w-md w-full shadow-xl border-slate-200">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
            <Lock className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            {t('auth.title')}
          </CardTitle>
          <CardDescription className="text-slate-500 mt-1">
            {t('auth.subtitle')}
          </CardDescription>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <Input
            label={t('auth.emailOrPhone')}
            type="email"
            placeholder="e.g. staff@gmail.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <div className="relative">
            <Input
              label={t('auth.password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <Button variant="primary" size="lg" type="submit" className="w-full cursor-pointer" disabled={loading}>
            {loading ? 'Authenticating...' : (t('auth.signInBtn') || 'Sign In')}
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
          <p>
            Secure, unified staff portal. Role permissions are enforced by the server after authentication.
          </p>
        </div>
      </Card>
    </div>
  );
}

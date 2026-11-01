import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { useAuth, ROLES } from '../context/AuthContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Lock, UserCheck, Shield, KeyRound } from 'lucide-react';

export function StaffLogin() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    const authUser = login(email, password);

    switch (authUser.role) {
      case ROLES.RECEPTIONIST:
        navigate('/staff/receptionist');
        break;
      case ROLES.DOCTOR:
        navigate('/staff/doctor');
        break;
      case ROLES.OWNER:
        navigate('/staff/owner');
        break;
      default:
        navigate('/staff/receptionist');
    }
  };

  const handleQuickFill = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
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
            placeholder="e.g. staff@aarogyam.clinic"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
          />

          <div>
            <Input
              label={t('auth.password')}
              type="password"
              placeholder="••••••••••••"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
            />
            <div className="mt-1 text-right">
              <span className="text-xs text-teal-700 hover:text-teal-800 cursor-pointer">
                Forgot password? Contact Clinic Administrator
              </span>
            </div>
          </div>

          <Button variant="primary" size="lg" type="submit" className="w-full">
            <UserCheck className="w-4 h-4 mr-2" />
            {t('auth.signInBtn')}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-teal-600" />
            <span>Development Mode: Quick Role Sign-in</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickFill('reception@aarogyam.clinic')}
              className="p-2 rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-700 text-center transition-colors cursor-pointer"
            >
              <div className="font-semibold text-teal-800">Receptionist</div>
              <div className="text-[10px] text-slate-500 truncate">Priya</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('dr.sharma@aarogyam.clinic')}
              className="p-2 rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-700 text-center transition-colors cursor-pointer"
            >
              <div className="font-semibold text-teal-800">Doctor</div>
              <div className="text-[10px] text-slate-500 truncate">Dr. Sharma</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('admin@aarogyam.clinic')}
              className="p-2 rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-700 text-center transition-colors cursor-pointer"
            >
              <div className="font-semibold text-teal-800">Administrator</div>
              <div className="text-[10px] text-slate-500 truncate">Clinic Owner</div>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}


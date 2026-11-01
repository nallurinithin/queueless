import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { useAuth, ROLES } from '../context/AuthContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Lock, UserCheck, Shield } from 'lucide-react';

export function StaffLogin() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState(ROLES.RECEPTIONIST);
  const [email, setEmail] = useState('reception@aarogyam.clinic');
  const [password, setPassword] = useState('password123');

  const handleLogin = (e) => {
    e.preventDefault();
    login(role, { email });

    switch (role) {
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

        <form onSubmit={handleLogin} className="space-y-5">
          <Select
            label={t('auth.roleSelect')}
            value={role}
            onChange={(e) => {
              const newRole = e.target.value;
              setRole(newRole);
              if (newRole === ROLES.DOCTOR) setEmail('dr.sharma@aarogyam.clinic');
              else if (newRole === ROLES.OWNER) setEmail('admin@aarogyam.clinic');
              else setEmail('reception@aarogyam.clinic');
            }}
            options={[
              { value: ROLES.RECEPTIONIST, label: t('auth.roleReceptionist') },
              { value: ROLES.DOCTOR, label: t('auth.roleDoctor') },
              { value: ROLES.OWNER, label: t('auth.roleOwner') },
            ]}
          />

          <Input
            label={t('auth.emailOrPhone')}
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label={t('auth.password')}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button variant="primary" size="lg" type="submit" className="w-full">
            <UserCheck className="w-4 h-4 mr-2" />
            {t('auth.signInBtn')}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center text-xs text-slate-500 space-x-1.5">
          <Shield className="w-3.5 h-3.5 text-teal-600" />
          <span>{t('auth.demoHint')}</span>
        </div>
      </Card>
    </div>
  );
}

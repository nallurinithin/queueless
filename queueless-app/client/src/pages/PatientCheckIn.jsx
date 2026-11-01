import React, { useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { QrCode, CheckCircle2, Clock, MapPin } from 'lucide-react';

export function PatientCheckIn() {
  const { t } = useTranslation();
  const [method, setMethod] = useState('reference');
  const [inputVal, setInputVal] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [tokenResult, setTokenResult] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    // Simulate Check-In Result
    const mockToken = `A-${Math.floor(10 + Math.random() * 80)}`;
    setTokenResult({
      token: mockToken,
      department: 'General Medicine',
      doctor: 'Dr. Sharma',
      allocatedSlot: '10:30 AM',
      checkInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setCheckedIn(true);
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <Card className="shadow-lg border-slate-200">
        {!checkedIn ? (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {t('checkIn.title')}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {t('checkIn.subtitle')}
              </p>
            </div>

            {/* Check-In Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => setMethod('reference')}
                className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                  method === 'reference'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('checkIn.methodReference')}
              </button>
              <button
                type="button"
                onClick={() => setMethod('phone')}
                className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                  method === 'phone'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('checkIn.methodPhone')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={method === 'reference' ? t('checkIn.methodReference') : t('checkIn.methodPhone')}
                placeholder={method === 'reference' ? 'e.g. QL-784912' : 'e.g. 9876543210'}
                required
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                helperText="Check-in activates your priority window in the live queue."
              />

              <Button variant="primary" size="lg" type="submit" className="w-full">
                {t('checkIn.btnCheckIn')}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Need help checking in? Please step up to the clinic reception desk.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-slate-900">
                {t('checkIn.checkInSuccess')}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {t('checkIn.arriveNotice')}
              </p>
            </div>

            <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-6 max-w-xs mx-auto">
              <div className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                {t('checkIn.tokenAssigned')}
              </div>
              <div className="text-4xl font-extrabold text-teal-900 mt-2">
                {tokenResult.token}
              </div>
              <div className="mt-3 text-xs text-teal-700 space-y-1 border-t border-teal-200/60 pt-2">
                <p><strong>Department:</strong> {tokenResult.department}</p>
                <p><strong>Doctor:</strong> {tokenResult.doctor}</p>
                <p><strong>Check-in recorded:</strong> {tokenResult.checkInTime}</p>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                setCheckedIn(false);
                setInputVal('');
              }}
            >
              Check In Another Patient
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}


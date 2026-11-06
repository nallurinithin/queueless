import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { QrCode, CheckCircle2, Clock, ArrowRight, RefreshCw } from 'lucide-react';

export function PatientCheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryRef = new URLSearchParams(location.search).get('ref') || '';

  const [reference, setReference] = useState(queryRef);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tokenResult, setTokenResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanRef = reference.trim().toUpperCase();
    if (!cleanRef) {
      setErrorMsg('Please enter your 8-character booking reference.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/queue/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bookingReference: cleanRef }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Check-in failed. Please verify your reference or visit the front desk.');
      }

      setTokenResult({
        token: data.data.token,
        status: data.data.status,
        estimatedWaitMins: data.data.estimatedWaitMins || 15,
        alreadyCheckedIn: data.alreadyCheckedIn,
        checkInTime: data.data.checkedInAt
          ? new Date(data.data.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      setErrorMsg(err.message || 'Check-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <Card className="shadow-lg border-slate-200">
        {!tokenResult ? (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {t('checkIn.title')}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Enter your booking reference or scan the on-site QR code to enter the live queue.
              </p>
            </div>

            {errorMsg && (
              <Alert variant="danger" className="mb-4">
                {errorMsg}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Booking Reference *"
                placeholder="e.g. QL-829104"
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                helperText="Check-in activates your priority window and issues your sequential queue token."
                autoFocus
              />

              <Button variant="primary" size="lg" type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Checking In...
                  </>
                ) : (
                  t('checkIn.btnCheckIn')
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Need help checking in? Please step up to the clinic reception desk for assisted arrival.
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
                {tokenResult.alreadyCheckedIn ? 'Already Checked In' : t('checkIn.checkInSuccess')}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {tokenResult.alreadyCheckedIn
                  ? 'Your token is already active in the queue.'
                  : t('checkIn.arriveNotice')}
              </p>
            </div>

            <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-6 max-w-xs mx-auto shadow-xs">
              <div className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                {t('checkIn.tokenAssigned')}
              </div>
              <div className="text-5xl font-black font-mono text-teal-900 mt-2">
                {tokenResult.token}
              </div>
              <div className="mt-3 text-xs text-teal-700 space-y-1 border-t border-teal-200 pt-2">
                <p><strong>Status:</strong> <span className="uppercase font-semibold">{tokenResult.status}</span></p>
                <p><strong>Est. Wait:</strong> ~{tokenResult.estimatedWaitMins} mins</p>
                <p><strong>Check-in Time:</strong> {tokenResult.checkInTime}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => navigate(`/queue?token=${tokenResult.token}`)}
              >
                <span>Track Live Queue</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTokenResult(null);
                  setReference('');
                }}
              >
                Check In Another Patient
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

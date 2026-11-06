import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import {
  Clock,
  Users,
  Bell,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  MapPin,
  Calendar,
} from 'lucide-react';

export function PatientQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tokenQuery, setTokenQuery] = useState(
    searchParams.get('token') || searchParams.get('ref') || ''
  );
  const [activeQueue, setActiveQueue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const fetchQueueData = useCallback(async (queryStr) => {
    const clean = (queryStr || '').trim().toUpperCase();
    if (!clean) return;

    setErrorMsg('');
    try {
      const res = await fetch(`/api/v1/queue/track/${clean}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Token or booking reference not found for today.');
      }

      setActiveQueue(data.data);
      setHasSearched(true);
    } catch (err) {
      setErrorMsg(err.message || 'Unable to fetch queue status.');
      setActiveQueue(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search on mount if URL parameter was supplied
  useEffect(() => {
    const initial = searchParams.get('token') || searchParams.get('ref');
    if (initial) {
      setTokenQuery(initial);
      setLoading(true);
      fetchQueueData(initial);
    }
  }, [searchParams, fetchQueueData]);

  // Real-time polling every 5 seconds when tracking an active token
  useEffect(() => {
    if (!hasSearched || !tokenQuery || activeQueue?.status === 'COMPLETED') return;
    const interval = setInterval(() => {
      fetchQueueData(tokenQuery);
    }, 5000);
    return () => clearInterval(interval);
  }, [hasSearched, tokenQuery, activeQueue?.status, fetchQueueData]);

  
  const handlePayDeposit = async (appointmentId) => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/v1/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate checkout.');
      }

      const orderData = data.data;
      if (!window.Razorpay) {
        throw new Error('Razorpay SDK failed to load. Please check your internet connection.');
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Aarogyam Community Clinic',
        description: 'Appointment Commitment Deposit',
        order_id: orderData.orderId,
        handler: async function (response) {
          const verifyRes = await fetch('/api/v1/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            alert('Deposit Payment Successful! Your appointment is now Confirmed.');
            if (tokenQuery) {
              fetchQueueData(tokenQuery);
            }
          } else {
            setErrorMsg(verifyData.error || 'Payment verification failed.');
          }
        },
        theme: {
          color: '#0d9488',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setErrorMsg(`Payment failed: ${resp.error.description}`);
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(err.message || 'Payment initiation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!tokenQuery.trim()) return;
    setLoading(true);
    fetchQueueData(tokenQuery);
  };

  const handleClear = () => {
    setTokenQuery('');
    setActiveQueue(null);
    setHasSearched(false);
    setErrorMsg('');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CALLED':
        return <Badge variant="danger" size="lg" className="animate-pulse">Called • Enter Room</Badge>;
      case 'SERVING':
        return <Badge variant="warning" size="lg">Consultation in Progress</Badge>;
      case 'WAITING':
        return <Badge variant="primary" size="lg">Waiting in Queue</Badge>;
      case 'COMPLETED':
        return <Badge variant="success" size="lg">Consultation Completed</Badge>;
      case 'SLOT_HELD':
        return <Badge variant="warning" size="lg">Slot Held • Deposit Required</Badge>;
      case 'HOLD_EXPIRED':
        return <Badge variant="danger" size="lg">Slot Hold Expired</Badge>;
      case 'NOT_CHECKED_IN':
        return <Badge variant="warning" size="lg">Arrival Check-In Needed</Badge>;
      case 'PENDING_REVIEW':
        return <Badge variant="default" size="lg">Awaiting Clinic Review</Badge>;
      default:
        return <Badge variant="default" size="lg">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Search Header */}
      <Card className="border-slate-200">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-slate-900">{t('patientQueue.title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your Queue Token (e.g. <strong>GEN-01</strong>) or Booking Reference (e.g. <strong>QL-829104</strong>) to track live clinic progress.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="e.g. GEN-01 or QL-829104"
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
              autoFocus
            />
          </div>
          <Button variant="primary" type="submit" disabled={loading || !tokenQuery.trim()}>
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-1.5" />
            )}
            {t('patientQueue.search')}
          </Button>
          {hasSearched && (
            <Button variant="outline" type="button" onClick={handleClear}>
              Clear
            </Button>
          )}
        </form>

        {errorMsg && (
          <Alert variant="danger" className="mt-4">
            {errorMsg}
          </Alert>
        )}
      </Card>

      {/* Main Live Queue Result Card */}
      {activeQueue && (
        <Card className="border-slate-200 shadow-lg overflow-hidden animate-fadeIn">
          {activeQueue.status === 'NOT_CHECKED_IN' ? (
            /* NOT CHECKED IN STATE */
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Appointment Confirmed</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  {activeQueue.message}
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs max-w-sm mx-auto text-left space-y-1.5">
                <p><strong>Booking Reference:</strong> {activeQueue.token}</p>
                <p><strong>Assigned Practitioner:</strong> {activeQueue.doctorName} ({activeQueue.roomNumber})</p>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  onClick={() => navigate(`/check-in?ref=${activeQueue.token}`)}
                >
                  <span>Check In for Consultation</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          
          ) : activeQueue.status === 'HOLD_EXPIRED' ? (
            /* HOLD EXPIRED STATE */
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Slot Hold Window Expired</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  The 5-minute reservation window has expired. Your appointment is waiting for reception to re-allocate your slot.
                </p>
              </div>

              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs max-w-sm mx-auto text-left space-y-1.5 text-rose-900">
                <p><strong>Booking Reference:</strong> {activeQueue.token}</p>
                <p><strong>Status:</strong> Awaiting Reception Re-Allocation</p>
                <p className="text-slate-600">Please step up to the reception desk or ask staff to refresh your slot window.</p>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => fetchQueueData(activeQueue.token)}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  <span>Check For Refreshed Slot</span>
                </Button>
              </div>
            </div>
          ) : activeQueue.status === 'SLOT_HELD' ? (
            /* SLOT HELD STATE */
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Slot Held for 5 Minutes</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  Your doctor and slot have been reserved! Please complete the ₹100 commitment deposit to confirm.
                </p>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs max-w-sm mx-auto text-left space-y-1.5">
                <p><strong>Booking Reference:</strong> {activeQueue.token}</p>
                <p><strong>Doctor:</strong> {activeQueue.doctorName} ({activeQueue.roomNumber})</p>
                <p><strong>Deposit Required:</strong> ₹100 (Refundable under clinic policy)</p>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => handlePayDeposit(activeQueue.appointmentId)}
                >
                  <span>Pay ₹100 Deposit (Razorpay / UPI)</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
) : activeQueue.status === 'PENDING_REVIEW' ? (
            /* PENDING REVIEW STATE */
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Request Pending Review</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {activeQueue.message}
              </p>
            </div>
          ) : (
            /* ACTIVE QUEUE STATE */
            <div>
              {/* Now Serving Header */}
              <div className="bg-slate-900 text-white p-6 -m-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs uppercase tracking-widest text-teal-400 font-bold block mb-1">
                    {t('patientQueue.nowServing')}
                  </span>
                  <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
                    {activeQueue.nowServing || 'None'}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-medium">Assigned Practitioner</span>
                  <span className="text-sm font-bold text-white">{activeQueue.doctorName}</span>
                  <span className="text-xs font-semibold text-teal-300 block">{activeQueue.roomNumber}</span>
                </div>
              </div>

              {/* Patient's Token Information */}
              <div className="pt-4 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
                  <div>
                    <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                      {t('patientQueue.yourToken')}
                    </span>
                    <div className="text-4xl font-black text-slate-900 font-mono mt-0.5">
                      {activeQueue.token}
                    </div>
                  </div>

                  <div>{getStatusBadge(activeQueue.status)}</div>
                </div>

                {/* Queue Metrics: Patients Ahead & Estimated Wait */}
                {activeQueue.status !== 'COMPLETED' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                      <Users className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                      <span className="text-xs text-slate-500 font-medium">
                        {t('patientQueue.patientsAhead')}
                      </span>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1">
                        {activeQueue.patientsAhead}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                      <Clock className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                      <span className="text-xs text-slate-500 font-medium">
                        {t('patientQueue.estimatedWait')}
                      </span>
                      <div className="text-3xl font-extrabold text-slate-900 mt-1">
                        ~{activeQueue.estimatedWaitMins} mins
                      </div>
                    </div>
                  </div>
                )}

                {/* Approaching Turn Alert Banner */}
                {(activeQueue.status === 'CALLED' || activeQueue.patientsAhead <= 1) &&
                  activeQueue.status !== 'COMPLETED' && (
                    <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-start space-x-3 text-teal-900 text-sm">
                      <Bell className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5 animate-bounce" />
                      <div>
                        <span className="font-semibold block">{t('patientQueue.turnAlert')}</span>
                        <span className="text-teal-800 text-xs mt-0.5 block">
                          Please proceed towards {activeQueue.roomNumber}. Your token will be announced on the waiting room display and audio speaker.
                        </span>
                      </div>
                    </div>
                  )}

                {/* Completed Banner */}
                {activeQueue.status === 'COMPLETED' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-emerald-800 text-sm">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <strong>Consultation Completed</strong>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Thank you for visiting Aarogyam Community Clinic.
                    </p>
                  </div>
                )}

                {/* Live Status Indicator */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live Auto-Sync Active (5s)</span>
                  </div>
                  <span>Aarogyam Community Clinic</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

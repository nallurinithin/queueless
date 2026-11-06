import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import {
  Stethoscope,
  PhoneCall,
  CheckCircle2,
  UserX,
  Clock,
  RefreshCw,
  PlayCircle,
  AlertCircle,
} from 'lucide-react';

export function DoctorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [currentPatient, setCurrentPatient] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch real-time active queue for the clinic/doctor
  const fetchDoctorQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/staff/queue', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        const entries = data.data;

        // Current consultation is either SERVING or CALLED
        const activeEntry = entries.find((e) =>
          ['SERVING', 'CALLED'].includes(e.queueStatus)
        );

        if (activeEntry) {
          const startedTimestamp = activeEntry.servingAt || activeEntry.calledAt || activeEntry.updatedAt;
          const elapsed = startedTimestamp
            ? Math.max(0, Math.round((Date.now() - new Date(startedTimestamp).getTime()) / 60000))
            : 0;

          setCurrentPatient({
            id: activeEntry._id,
            token: activeEntry.publicToken,
            patientName: activeEntry.patientId?.fullName || 'Walk-In Patient',
            age: activeEntry.patientId?.age || '—',
            gender: activeEntry.patientId?.gender || '—',
            reason: activeEntry.priorityReason || 'General Consultation',
            startedAt: startedTimestamp
              ? new Date(startedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Just now',
            elapsedMins: elapsed,
            status: activeEntry.queueStatus,
          });
        } else {
          setCurrentPatient(null);
        }

        // Waiting queue contains entries in WAITING state
        const waitingEntries = entries
          .filter((e) => e.queueStatus === 'WAITING')
          .map((e) => ({
            id: e._id,
            token: e.publicToken,
            name: e.patientId?.fullName || 'Walk-In Patient',
            type: e.entryType === 'WALK_IN' ? 'Walk-In' : 'Booked',
            waitTime: e.checkedInAt
              ? `${Math.max(1, Math.round((Date.now() - new Date(e.checkedInAt).getTime()) / 60000))}m`
              : '0m',
          }));

        setQueue(waitingEntries);
      }
    } catch (err) {
      console.error('Failed to fetch doctor queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for updates every 7 seconds
  useEffect(() => {
    fetchDoctorQueue();
    const interval = setInterval(fetchDoctorQueue, 7000);
    return () => clearInterval(interval);
  }, [fetchDoctorQueue]);

  // Call Next Patient
  const handleCallNext = async () => {
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/v1/staff/queue/call-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          doctorId: user?.doctorId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to call next patient.');
      }

      if (data.data?.hasWaitingPatients === false) {
        setSuccessMsg('No waiting patients currently in queue.');
      } else {
        setSuccessMsg(`Called next patient: ${data.data?.queueEntry?.publicToken || ''}`);
      }

      await fetchDoctorQueue();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Begin Consultation (CALLED -> SERVING)
  const handleStartServing = async (queueId) => {
    if (!queueId) return;
    setActionLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/v1/staff/queue/${queueId}/serve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ doctorId: user?.doctorId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to begin consultation.');
      }

      setSuccessMsg('Consultation started.');
      await fetchDoctorQueue();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Consultation (SERVING -> COMPLETED)
  const handleComplete = async (queueId) => {
    if (!queueId) return;
    setActionLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/v1/staff/queue/${queueId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ doctorId: user?.doctorId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete consultation.');
      }

      setSuccessMsg('Consultation successfully marked complete.');
      setCurrentPatient(null);
      await fetchDoctorQueue();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Mark Patient No-Show / Skip (CALLED or SERVING -> SKIPPED)
  const handleSkip = async (queueId) => {
    if (!queueId) return;
    setActionLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/v1/staff/queue/${queueId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Patient did not respond / No show' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark patient skipped.');
      }

      setSuccessMsg('Patient marked as skipped / no-show.');
      setCurrentPatient(null);
      await fetchDoctorQueue();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const doctorDisplayName = user?.name || 'Dr. Suresh';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t('dashboards.doctor.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Room 101 • General Medicine • {doctorDisplayName}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDoctorQueue}
            disabled={loading || actionLoading}
            className="flex items-center gap-1.5"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Badge variant="success" size="lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Clinic Online
          </Badge>
        </div>
      </div>

      {/* Notification Alerts */}
      {errorMsg && (
        <Alert variant="danger">
          <AlertCircle className="w-4 h-4 mr-2" />
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {successMsg}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Consultation */}
        <div className="lg:col-span-2 space-y-6">
          {currentPatient ? (
            <Card className="border-2 border-teal-500/60 shadow-lg p-6 bg-white">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Stethoscope className="w-5 h-5 text-teal-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    {currentPatient.status === 'CALLED'
                      ? 'PATIENT CALLED — WAITING TO ENTER'
                      : t('dashboards.doctor.consultationActive')}
                  </span>
                </div>
                <Badge variant={currentPatient.status === 'CALLED' ? 'warning' : 'success'} size="md">
                  {currentPatient.status === 'CALLED'
                    ? 'Called'
                    : `Elapsed: ${currentPatient.elapsedMins} mins`}
                </Badge>
              </div>

              <div className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase">Token Number</span>
                  <div className="text-5xl font-mono font-black text-slate-900">
                    {currentPatient.token}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mt-2">
                    {currentPatient.patientName}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {currentPatient.age} yrs • {currentPatient.gender}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-xs w-full text-xs text-slate-600 space-y-1">
                  <p><strong>Started / Called:</strong> {currentPatient.startedAt}</p>
                  <p><strong>Status:</strong> {currentPatient.status}</p>
                  <p><strong>Reason:</strong> {currentPatient.reason}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                {currentPatient.status === 'CALLED' ? (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => handleStartServing(currentPatient.id)}
                    disabled={actionLoading}
                    className="flex-1 cursor-pointer"
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    {t('dashboards.doctor.startConsultation') || 'Begin Consultation (Serving)'}
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    size="lg"
                    onClick={() => handleComplete(currentPatient.id)}
                    disabled={actionLoading}
                    className="flex-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    {t('dashboards.doctor.completeConsultation')}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => handleSkip(currentPatient.id)}
                  disabled={actionLoading}
                  className="cursor-pointer"
                >
                  <UserX className="w-5 h-5 mr-2 text-rose-500" />
                  {t('dashboards.doctor.skipPatient')}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="text-center py-12 px-6 border-slate-200 bg-slate-50/50">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <Stethoscope className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                No Consultation Currently in Progress
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Your consultation room is ready. Call the next eligible patient when you are prepared.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={handleCallNext}
                disabled={actionLoading || queue.length === 0}
                className="cursor-pointer"
              >
                <PhoneCall className="w-5 h-5 mr-2" />
                {queue.length > 0
                  ? t('dashboards.doctor.callNext')
                  : 'No Patients Waiting in Queue'}
              </Button>
            </Card>
          )}

          <Alert variant="info">
            <strong>Clinical Safety Rule:</strong> Consultations in progress are never interrupted by queue re-ordering or emergency walk-ins. Emergency priority is applied to the very next eligible slot.
          </Alert>
        </div>

        {/* Right Col: Waiting Queue */}
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-base">
                {t('dashboards.doctor.myQueue')} ({queue.length})
              </h3>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>

            <div className="divide-y divide-slate-100">
              {queue.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  {t('dashboards.doctor.noPatients')}
                </div>
              ) : (
                queue.map((item, idx) => (
                  <div key={item.id || item.token} className="py-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-base text-teal-800">{item.token}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{item.name}</h4>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <Badge variant={item.type === 'Booked' ? 'primary' : 'default'} size="sm">
                            {item.type}
                          </Badge>
                          <span className="text-[11px] text-slate-400">Wait: {item.waitTime}</span>
                        </div>
                      </div>
                    </div>

                    {!currentPatient && idx === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCallNext}
                        disabled={actionLoading}
                        className="cursor-pointer"
                      >
                        {t('dashboards.doctor.callNext')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

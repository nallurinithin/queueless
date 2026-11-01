import React, { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { User, PhoneCall, CheckCircle2, UserX, Clock, Stethoscope } from 'lucide-react';

export function DoctorDashboard() {
  const { t } = useTranslation();

  const [currentPatient, setCurrentPatient] = useState({
    token: 'A-11',
    patientName: 'Vikram S.',
    age: 42,
    gender: 'Male',
    reason: 'Follow-up on hypertension & routine vitals',
    startedAt: '10:15 AM',
    elapsedMins: 12,
  });

  const [queue, setQueue] = useState([
    { token: 'A-12', name: 'Rani K.', type: 'Walk-In', waitTime: '15m' },
    { token: 'A-13', name: 'Mohammed A.', type: 'Booked', waitTime: '8m' },
    { token: 'A-14', name: 'Sanjay P.', type: 'Booked', waitTime: '2m' },
  ]);

  const handleComplete = () => {
    alert('Consultation marked completed.');
    if (queue.length > 0) {
      const next = queue[0];
      setCurrentPatient({
        token: next.token,
        patientName: next.name,
        age: 35,
        gender: 'Female',
        reason: 'General consultation',
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        elapsedMins: 0,
      });
      setQueue((prev) => prev.slice(1));
    } else {
      setCurrentPatient(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t('dashboards.doctor.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Room 101 • General Medicine • Dr. Sharma
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Badge variant="success" size="lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Clinic Online
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Consultation */}
        <div className="lg:col-span-2 space-y-6">
          {currentPatient ? (
            <Card className="border-2 border-teal-500/60 shadow-lg p-6 bg-white">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Stethoscope className="w-5 h-5 text-teal-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    {t('dashboards.doctor.consultationActive')}
                  </span>
                </div>
                <Badge variant="warning" size="md">
                  Elapsed: {currentPatient.elapsedMins} mins
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
                  <p><strong>Started:</strong> {currentPatient.startedAt}</p>
                  <p><strong>Visit Category:</strong> Routine Follow-up</p>
                  <p><strong>Chief Complaint:</strong> {currentPatient.reason}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                <Button variant="success" size="lg" onClick={handleComplete} className="flex-1">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {t('dashboards.doctor.completeConsultation')}
                </Button>
                <Button variant="secondary" size="lg">
                  <UserX className="w-5 h-5 mr-2" />
                  {t('dashboards.doctor.skipPatient')}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="text-center py-12 border-slate-200">
              <p className="text-slate-500">{t('dashboards.doctor.noPatients')}</p>
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
              {queue.map((item, idx) => (
                <div key={item.token} className="py-3 flex items-center justify-between">
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

                  {idx === 0 && (
                    <Button variant="outline" size="sm" onClick={() => handleComplete()}>
                      {t('dashboards.doctor.callNext')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


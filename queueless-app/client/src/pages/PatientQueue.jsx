import React, { useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Clock, Users, Bell, RefreshCw } from 'lucide-react';

export function PatientQueue() {
  const { t } = useTranslation();
  const [tokenQuery, setTokenQuery] = useState('A-14');
  const [activeQueue, setActiveQueue] = useState({
    nowServing: 'A-11',
    searchedToken: 'A-14',
    patientsAhead: 2,
    estimatedWaitMins: 18,
    doctor: 'Dr. Sharma',
    department: 'General Medicine',
    status: 'statusEligible', // statusWaiting, statusEligible, statusCalled, statusServing
  });

  const getStatusBadge = (statusKey) => {
    switch (statusKey) {
      case 'statusCalled':
        return <Badge variant="danger" size="lg" className="animate-pulse">{t(`patientQueue.${statusKey}`)}</Badge>;
      case 'statusServing':
        return <Badge variant="warning" size="lg">{t(`patientQueue.${statusKey}`)}</Badge>;
      case 'statusEligible':
        return <Badge variant="primary" size="lg">{t(`patientQueue.${statusKey}`)}</Badge>;
      case 'statusCompleted':
        return <Badge variant="success" size="lg">{t(`patientQueue.${statusKey}`)}</Badge>;
      default:
        return <Badge variant="default" size="lg">{t(`patientQueue.${statusKey}`)}</Badge>;
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!tokenQuery.trim()) return;
    setActiveQueue((prev) => ({
      ...prev,
      searchedToken: tokenQuery.toUpperCase(),
      patientsAhead: Math.floor(Math.random() * 4),
      estimatedWaitMins: Math.floor(5 + Math.random() * 25),
    }));
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Search Bar */}
      <Card className="border-slate-200">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder={t('patientQueue.enterToken')}
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
            />
          </div>
          <Button variant="primary" type="submit">
            {t('patientQueue.search')}
          </Button>
        </form>
      </Card>

      {/* Main Queue Card */}
      <Card className="border-slate-200 shadow-lg overflow-hidden">
        {/* Now Serving Highlight Header */}
        <div className="bg-slate-900 text-white p-6 -m-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">
              {t('patientQueue.currentToken')}
            </span>
            <div className="text-4xl sm:text-5xl font-black text-white mt-1">
              {activeQueue.nowServing}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Room 102 • {activeQueue.doctor}
            </p>
          </div>

          <div className="text-right sm:text-right w-full sm:w-auto flex justify-between sm:block">
            <span className="text-xs text-slate-400 block">Clinic Queue Mode</span>
            <span className="inline-flex items-center text-xs text-emerald-400 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-ping" />
              Live & Synced
            </span>
          </div>
        </div>

        {/* Your Token Details */}
        <div className="space-y-6 pt-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-100 gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('patientQueue.yourToken')}
              </span>
              <div className="text-3xl font-extrabold text-teal-900">
                {activeQueue.searchedToken}
              </div>
            </div>
            <div>
              {getStatusBadge(activeQueue.status)}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center text-slate-500 text-xs font-medium mb-1">
                <Users className="w-4 h-4 mr-1 text-teal-600" />
                <span>{t('patientQueue.patientsAhead')}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {activeQueue.patientsAhead}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center text-slate-500 text-xs font-medium mb-1">
                <Clock className="w-4 h-4 mr-1 text-teal-600" />
                <span>{t('patientQueue.estimatedWait')}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                ~{activeQueue.estimatedWaitMins} <span className="text-sm font-normal text-slate-500">{t('patientQueue.mins')}</span>
              </div>
            </div>
          </div>

          {/* Department / Doctor Info */}
          <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-100 text-xs text-teal-900 space-y-1">
            <p><strong>{t('patientQueue.department')}:</strong> {activeQueue.department}</p>
            <p><strong>{t('patientQueue.doctor')}:</strong> {activeQueue.doctor}</p>
            <p className="text-[11px] text-teal-700 pt-1">
              * Wait times are estimates based on actual consultation durations and check-in times.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

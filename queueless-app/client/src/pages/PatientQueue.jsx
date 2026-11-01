import React, { useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Clock, Users, Bell, RefreshCw, Search, CheckCircle2 } from 'lucide-react';

export function PatientQueue() {
  const { t } = useTranslation();
  const [tokenQuery, setTokenQuery] = useState('');
  const [activeQueue, setActiveQueue] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

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

    setHasSearched(true);
    // In M1: interactive prototype response. In M4: real Socket.IO queue tracking.
    setActiveQueue({
      nowServing: 'A-11',
      searchedToken: tokenQuery.trim().toUpperCase(),
      patientsAhead: 2,
      estimatedWaitMins: 15,
      doctor: 'Dr. Sharma',
      department: 'General Medicine',
      status: 'statusEligible',
    });
  };

  const handleClear = () => {
    setTokenQuery('');
    setActiveQueue(null);
    setHasSearched(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Search Bar */}
      <Card className="border-slate-200">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-slate-900">{t('patientQueue.title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Check your real-time queue position and approximate arrival estimate.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder={t('patientQueue.enterToken')}
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
            />
          </div>
          <Button variant="primary" type="submit">
            <Search className="w-4 h-4 mr-1.5" />
            {t('patientQueue.search')}
          </Button>
          {hasSearched && (
            <Button variant="outline" type="button" onClick={handleClear}>
              Clear
            </Button>
          )}
        </form>
      </Card>

      {/* Main Queue State */}
      {activeQueue ? (
        <Card className="border-slate-200 shadow-lg overflow-hidden animate-fadeIn">
          {/* Now Serving Highlight Header */}
          <div className="bg-slate-900 text-white p-6 -m-6 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-teal-400 font-bold block mb-1">
                {t('patientQueue.nowServing')}
              </span>
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
                {activeQueue.nowServing}
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 block">{activeQueue.doctor}</span>
              <span className="text-xs font-medium text-teal-300">{activeQueue.department} • Room 101</span>
            </div>
          </div>

          {/* Searched Patient Status Box */}
          <div className="pt-4 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  {t('patientQueue.yourToken')}
                </span>
                <div className="text-3xl font-extrabold text-slate-900 font-mono mt-0.5">
                  {activeQueue.searchedToken}
                </div>
              </div>

              <div>
                {getStatusBadge(activeQueue.status)}
              </div>
            </div>

            {/* Metrics: Patients Ahead & Estimated Wait */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                <Users className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                <span className="text-xs text-slate-500 font-medium">{t('patientQueue.patientsAhead')}</span>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">
                  {activeQueue.patientsAhead}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                <Clock className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                <span className="text-xs text-slate-500 font-medium">{t('patientQueue.estimatedWait')}</span>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">
                  ~{activeQueue.estimatedWaitMins} {t('common.mins')}
                </div>
              </div>
            </div>

            {/* Approaching Turn Alert Banner */}
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-start space-x-3 text-teal-900 text-sm">
              <Bell className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">{t('patientQueue.turnAlert')}</span>
                <span className="text-teal-800 text-xs mt-0.5 block">
                  Please proceed towards waiting room 101. Your token will be announced shortly on the clinic display and speakers.
                </span>
              </div>
            </div>

            {/* Footer Hint */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <div className="flex items-center space-x-1">
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                <span>Live connection active</span>
              </div>
              <span>Aarogyam Community Clinic</span>
            </div>
          </div>
        </Card>
      ) : (
        /* Empty State */
        <Card className="border-slate-200 py-12 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <CardTitle className="text-lg font-bold text-slate-800">
            No Token Currently Selected
          </CardTitle>
          <CardDescription className="text-sm text-slate-500 max-w-sm mx-auto mt-1.5">
            Enter your token sequence number (e.g., <span className="font-semibold text-slate-700">A-14</span>) or booking reference above to track live progress, estimated wait, and room calls.
          </CardDescription>
        </Card>
      )}
    </div>
  );
}

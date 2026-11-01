import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Volume2, VolumeX, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/ui/Badge';

export function WaitingRoomDisplay() {
  const { t } = useTranslation();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const nowServingList = [
    { token: 'A-11', room: '101', doctor: 'Dr. Sharma', dept: 'General Medicine', status: 'SERVING' },
    { token: 'B-04', room: '102', doctor: 'Dr. Ananya Rao', dept: 'Pediatrics', status: 'CALLED' },
    { token: 'C-08', room: '104', doctor: 'Dr. V. Reddy', dept: 'Orthopedics', status: 'SERVING' },
  ];

  const upNextList = ['A-12', 'A-13', 'B-05', 'C-09'];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 select-none">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-800 pb-6 gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-teal-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
            Q
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('common.clinicName')}
            </h1>
            <p className="text-sm text-teal-400 font-medium">
              {t('display.waitingRoom')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span>Voice Audio: {audioEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <div className="text-2xl sm:text-3xl font-mono font-bold text-slate-200">
            {currentTime}
          </div>
        </div>
      </header>

      {/* Main Grid: NOW SERVING */}
      <main className="my-8">
        <div className="text-center mb-8">
          <span className="text-base sm:text-xl font-black uppercase tracking-widest text-teal-400 bg-teal-950/80 px-6 py-2 rounded-full border border-teal-800/80">
            {t('display.nowServing')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-7xl mx-auto">
          {nowServingList.map((item) => (
            <div
              key={item.token}
              className={`rounded-3xl p-8 border-2 flex flex-col items-center justify-center text-center transition-all ${
                item.status === 'CALLED'
                  ? 'bg-rose-950/40 border-rose-500/80 shadow-2xl shadow-rose-950 animate-pulse'
                  : 'bg-slate-900/90 border-slate-700 shadow-xl'
              }`}
            >
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                {t('display.token')}
              </span>
              <div className="text-6xl sm:text-7xl font-black text-white tracking-wider my-3 font-mono">
                {item.token}
              </div>

              <div className="w-full pt-4 border-t border-slate-800/80 space-y-1">
                <div className="text-xl font-bold text-teal-300">
                  {t('display.room')} {item.room}
                </div>
                <div className="text-sm font-medium text-slate-300">
                  {item.doctor}
                </div>
                <div className="text-xs text-slate-500">
                  {item.dept}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Up Next Ribbon */}
        <div className="mt-12 max-w-4xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold uppercase tracking-wider text-slate-400">
            {t('display.nextInLine')}
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {upNextList.map((tok) => (
              <span
                key={tok}
                className="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 font-mono font-bold text-xl text-teal-200"
              >
                {tok}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Privacy Notice Footer */}
      <footer className="pt-6 border-t border-slate-900 flex items-center justify-center text-xs text-slate-500 space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <span>{t('display.privacyNotice')}</span>
      </footer>
    </div>
  );
}


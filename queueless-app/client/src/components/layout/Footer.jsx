import React from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { ShieldCheck, Heart } from 'lucide-react';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white font-bold text-lg">
                Q
              </div>
              <span className="font-bold text-lg text-white">QueueLess</span>
            </div>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              {t('common.tagline')}
            </p>
            <div className="flex items-center text-xs text-teal-400 space-x-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Privacy-First Clinic Architecture</span>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              {t('landing.hoursTitle')}
            </h4>
            <div className="text-sm space-y-1.5 text-slate-400">
              <p>{t('landing.hoursMonFri')}</p>
              <p>{t('landing.hoursSat')}</p>
              <p>{t('landing.hoursSun')}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Emergency & Reception
            </h4>
            <p className="text-sm text-slate-400 mb-2">
              {t('landing.callClinic')}
            </p>
            <p className="text-xs text-slate-500">
              In accordance with clinic policy, emergencies and triage cases take clinical precedence.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>© {new Date().getFullYear()} QueueLess — Single-Clinic Pilot Edition (V1).</p>
          <p className="mt-2 sm:mt-0 flex items-center space-x-1">
            <span>Built for healthcare excellence</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </p>
        </div>
      </div>
    </footer>
  );
}


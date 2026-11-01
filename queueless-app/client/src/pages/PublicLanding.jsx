import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, Clock, ArrowRight, Shield, HeartPulse, Sparkles, MapPin } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function PublicLanding() {
  const { t } = useTranslation();

  const actionCards = [
    {
      to: '/book',
      icon: Calendar,
      title: t('landing.requestCardTitle'),
      desc: t('landing.requestCardDesc'),
      actionText: t('nav.bookAppointment'),
      color: 'bg-teal-50 text-teal-600 border-teal-200 hover:border-teal-400',
    },
    {
      to: '/check-in',
      icon: CheckCircle2,
      title: t('landing.checkInCardTitle'),
      desc: t('landing.checkInCardDesc'),
      actionText: t('nav.checkIn'),
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:border-emerald-400',
    },
    {
      to: '/queue',
      icon: Clock,
      title: t('landing.queueCardTitle'),
      desc: t('landing.queueCardDesc'),
      actionText: t('nav.liveQueue'),
      color: 'bg-sky-50 text-sky-600 border-sky-200 hover:border-sky-400',
    },
  ];

  return (
    <div className="space-y-16 py-8 md:py-12">
      {/* Hero Section */}
      <section className="text-center max-w-4xl mx-auto px-4">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs sm:text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4 text-teal-600" />
          <span>India-First Clinic Queue & Appointment Experience</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {t('landing.title')}
        </h1>

        <p className="mt-4 text-base sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
          {t('landing.subtitle')}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link to="/book">
            <Button variant="primary" size="lg" className="shadow-md">
              {t('landing.requestCardTitle')}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <Link to="/queue">
            <Button variant="secondary" size="lg">
              {t('landing.queueCardTitle')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Main Feature Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {actionCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.to}
                hover
                className="flex flex-col justify-between border-2 transition-all hover:-translate-y-1"
              >
                <div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                  <CardDescription className="text-slate-600 leading-relaxed">
                    {card.desc}
                  </CardDescription>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <Link to={card.to}>
                    <Button variant="outline" size="md" className="w-full">
                      <span>{card.actionText}</span>
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Clinic Information & Values */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center space-x-2 text-teal-400 text-sm font-semibold mb-2">
                <MapPin className="w-4 h-4" />
                <span>{t('common.clinicName')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Respecting Your Time & Health
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                Our clinic operates an intelligent FIFO queue engine integrated with booked appointment windows. We ensure consultations are thorough, unhurried, and never abruptly interrupted.
              </p>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-center space-x-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Strict patient privacy — names never exposed on public screens</span>
                </div>
                <div className="flex items-center space-x-2.5">
                  <HeartPulse className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Emergency priority and clinical triage handled by authorized staff</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700/60">
              <h3 className="text-lg font-semibold text-white mb-4">
                {t('landing.hoursTitle')}
              </h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="pb-2 border-b border-slate-700/60">
                  {t('landing.hoursMonFri')}
                </li>
                <li className="pb-2 border-b border-slate-700/60">
                  {t('landing.hoursSat')}
                </li>
                <li className="text-amber-300">
                  {t('landing.hoursSun')}
                </li>
              </ul>
              <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-400">
                {t('landing.callClinic')}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

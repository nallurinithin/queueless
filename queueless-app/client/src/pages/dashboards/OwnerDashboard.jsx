import React from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Building2, Users, Calendar, ShieldCheck, Settings, FileText } from 'lucide-react';

export function OwnerDashboard() {
  const { t } = useTranslation();

  const clinicStats = [
    { label: 'Total Consultations Today', value: '48', change: '+12% vs last week' },
    { label: 'Average Wait Time', value: '14 mins', change: 'Target: < 20 mins' },
    { label: 'Total Walk-Ins', value: '26', change: '54% of volume' },
    { label: 'Online Bookings', value: '22', change: '46% of volume' },
  ];

  const doctors = [
    { name: 'Dr. Sharma', dept: 'General Medicine', room: '101', hours: '08:30 - 13:30, 16:30 - 20:30', status: 'Active' },
    { name: 'Dr. Ananya Rao', dept: 'Pediatrics', room: '102', hours: '09:00 - 13:00', status: 'Active' },
    { name: 'Dr. V. Reddy', dept: 'Orthopedics', room: '104', hours: '16:00 - 20:00', status: 'On Break' },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t('dashboards.owner.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Clinic Master Configuration, Policies, and Performance
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Badge variant="primary" size="lg">
            Tenant: Aarogyam Community Clinic (V1)
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {clinicStats.map((stat) => (
          <Card key={stat.label} className="p-5 border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">{stat.value}</div>
            <span className="text-xs text-teal-600 mt-1 block font-medium">{stat.change}</span>
          </Card>
        ))}
      </div>

      {/* Two Column Layout: Doctors & Clinic Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctors Roster */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
                <Users className="w-5 h-5 text-teal-600" />
                <span>{t('dashboards.owner.departments')}</span>
              </h3>
              <Button variant="outline" size="sm">Manage Staff</Button>
            </div>

            <div className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <div key={doc.name} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900">{doc.name}</h4>
                    <p className="text-xs text-slate-500">{doc.dept} • Room {doc.room}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Hours: {doc.hours}</p>
                  </div>
                  <Badge variant={doc.status === 'Active' ? 'success' : 'warning'}>
                    {doc.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Policy Configuration Card */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
                <Settings className="w-5 h-5 text-teal-600" />
                <span>{t('dashboards.owner.policies')}</span>
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="font-semibold text-slate-800 block mb-0.5">Advance Deposit</span>
                <p>₹100 (Applicable to confirmed remote appointments only). Walk-ins pay ₹0 advance.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="font-semibold text-slate-800 block mb-0.5">Cancellation & Refund</span>
                <p>Full refund if cancelled &gt;2 hours before appointment slot. 5-minute allocation hold window.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="font-semibold text-slate-800 block mb-0.5">Queue Algorithm</span>
                <p>FIFO baseline with bounded appointment priority within ±15 minutes of scheduled time.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

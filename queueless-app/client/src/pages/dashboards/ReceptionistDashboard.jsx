import React, { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Users, Clock, PlusCircle, CheckCircle2, PhoneCall, AlertCircle } from 'lucide-react';

export function ReceptionistDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'requests'

  const pendingRequests = [
    { id: 'req_1', ref: 'QL-829104', patient: 'Anil Verma', phone: '9848011223', date: 'Today', window: 'Morning', dept: 'General Medicine', status: 'Pending Review' },
    { id: 'req_2', ref: 'QL-419023', patient: 'Sunita Devi', phone: '9908123456', date: 'Today', window: 'Evening', dept: 'Pediatrics', status: 'Pending Review' },
  ];

  const activeQueue = [
    { token: 'A-11', patient: 'Vikram S.', type: 'Booked', slot: '10:15 AM', doctor: 'Dr. Sharma', status: 'SERVING', checkIn: '10:05 AM' },
    { token: 'A-12', patient: 'Rani K.', type: 'Walk-In', slot: 'Queue FIFO', doctor: 'Dr. Sharma', status: 'WAITING', checkIn: '10:12 AM' },
    { token: 'A-13', patient: 'Mohammed A.', type: 'Booked', slot: '10:30 AM', doctor: 'Dr. Sharma', status: 'WAITING', checkIn: '10:20 AM' },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t('dashboards.receptionist.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time queue monitoring, walk-in registration, and appointment review
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Button variant="primary" size="md" className="flex-1 sm:flex-initial">
            <PlusCircle className="w-4 h-4 mr-2" />
            {t('dashboards.receptionist.walkInBtn')}
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-teal-50/50 border-teal-200">
          <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">Patients in Queue</span>
          <div className="text-3xl font-extrabold text-teal-900 mt-1">12</div>
          <span className="text-xs text-teal-700 mt-1 block">8 Checked-in, 4 Waiting</span>
        </Card>
        <Card className="p-4 bg-amber-50/50 border-amber-200">
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Requests</span>
          <div className="text-3xl font-extrabold text-amber-900 mt-1">2</div>
          <span className="text-xs text-amber-700 mt-1 block">Needs doctor/slot assignment</span>
        </Card>
        <Card className="p-4 bg-emerald-50/50 border-emerald-200">
          <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Active Doctors</span>
          <div className="text-3xl font-extrabold text-emerald-900 mt-1">3 On Duty</div>
          <span className="text-xs text-emerald-700 mt-1 block">Rooms 101, 102, 104</span>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-8">
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'queue'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('dashboards.receptionist.activeQueue')} ({activeQueue.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'requests'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('dashboards.receptionist.pendingRequests')} ({pendingRequests.length})
        </button>
      </div>

      {/* Tab 1: Live Queue Table */}
      {activeTab === 'queue' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Token</th>
                  <th className="px-6 py-3.5">Patient Name</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Assigned Doctor</th>
                  <th className="px-6 py-3.5">Check-In</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeQueue.map((item) => (
                  <tr key={item.token} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-base text-teal-900">{item.token}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.patient}</td>
                    <td className="px-6 py-4">
                      <Badge variant={item.type === 'Booked' ? 'primary' : 'default'}>{item.type}</Badge>
                    </td>
                    <td className="px-6 py-4">{item.doctor}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{item.checkIn}</td>
                    <td className="px-6 py-4">
                      <Badge variant={item.status === 'SERVING' ? 'warning' : 'info'}>{item.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="secondary" size="sm">
                        <PhoneCall className="w-3.5 h-3.5 mr-1" />
                        Call
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Pending Appointment Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {pendingRequests.map((req) => (
            <Card key={req.id} className="border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-sm text-teal-800">{req.ref}</span>
                  <Badge variant="warning">{req.status}</Badge>
                </div>
                <h4 className="text-lg font-bold text-slate-900 mt-1">{req.patient} ({req.phone})</h4>
                <div className="text-xs text-slate-500 mt-1 space-x-3">
                  <span><strong>Date:</strong> {req.date}</span>
                  <span><strong>Window:</strong> {req.window}</span>
                  <span><strong>Department:</strong> {req.dept}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Button variant="outline" size="sm">
                  {t('dashboards.receptionist.proposeAlternative')}
                </Button>
                <Button variant="primary" size="sm">
                  {t('dashboards.receptionist.assignSlot')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


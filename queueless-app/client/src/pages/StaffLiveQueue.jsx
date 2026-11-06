import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  Clock,
  Users,
  Stethoscope,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Activity,
} from 'lucide-react';

export function StaffLiveQueue() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDoctor, setFilterDoctor] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real queue entries for today from MongoDB Atlas
  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/staff/queue', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setQueueEntries(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch staff queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and live 6-second polling
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 6000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Unique list of doctors for filter dropdown
  const doctorList = Array.from(
    new Set(
      queueEntries
        .map((e) => e.doctorId?.staffUserId?.name)
        .filter(Boolean)
    )
  );

  // Filter entries
  const filteredEntries = queueEntries.filter((item) => {
    const docName = item.doctorId?.staffUserId?.name || '';
    const patientName = item.patientId?.fullName || '';
    const token = item.publicToken || '';

    if (filterDoctor !== 'ALL' && docName !== filterDoctor) {
      return false;
    }

    if (filterStatus !== 'ALL' && item.queueStatus !== filterStatus) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        token.toLowerCase().includes(q) ||
        patientName.toLowerCase().includes(q) ||
        docName.toLowerCase().includes(q)
      );
    }

    return true;
  });

  // Calculate live summary stats
  const totalToday = queueEntries.length;
  const servingCount = queueEntries.filter((e) => e.queueStatus === 'SERVING').length;
  const calledCount = queueEntries.filter((e) => e.queueStatus === 'CALLED').length;
  const waitingCount = queueEntries.filter((e) => e.queueStatus === 'WAITING').length;
  const completedCount = queueEntries.filter((e) => e.queueStatus === 'COMPLETED').length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SERVING':
        return (
          <Badge variant="warning" size="md" className="font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
            In Consultation
          </Badge>
        );
      case 'CALLED':
        return (
          <Badge variant="danger" size="md" className="font-semibold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5" />
            Called to Room
          </Badge>
        );
      case 'WAITING':
        return (
          <Badge variant="primary" size="md">
            In Waiting Room
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="success" size="md">
            Completed
          </Badge>
        );
      case 'SKIPPED':
        return (
          <Badge variant="default" size="md">
            Skipped / No-Show
          </Badge>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-teal-600" />
            <span>Clinic Live Queue Board</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time unified queue transparency across all doctors and departments
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueue}
            disabled={loading}
            className="flex items-center gap-1.5 cursor-pointer"
            title="Refresh Live Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </Button>

          <Badge variant="success" size="lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Live Sync Active
          </Badge>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 bg-white">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Tokens Today
          </span>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">{totalToday}</div>
          <span className="text-xs text-slate-400 mt-1 block">Clinic volume today</span>
        </Card>

        <Card className="p-4 border-amber-200 bg-amber-50/40">
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
            Now Serving
          </span>
          <div className="text-3xl font-extrabold text-amber-900 mt-1">{servingCount}</div>
          <span className="text-xs text-amber-700 mt-1 block">Active in doctor rooms</span>
        </Card>

        <Card className="p-4 border-rose-200 bg-rose-50/40">
          <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
            Called / Entering
          </span>
          <div className="text-3xl font-extrabold text-rose-900 mt-1">{calledCount}</div>
          <span className="text-xs text-rose-700 mt-1 block">Called to consult room</span>
        </Card>

        <Card className="p-4 border-teal-200 bg-teal-50/40">
          <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
            Waiting in Line
          </span>
          <div className="text-3xl font-extrabold text-teal-900 mt-1">{waitingCount}</div>
          <span className="text-xs text-teal-700 mt-1 block">{completedCount} consultations completed</span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by token (e.g. GEN-01) or patient name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Doctor Filter */}
          {doctorList.length > 0 && (
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Doctors</option>
              {doctorList.map((doc) => (
                <option key={doc} value={doc}>
                  {doc}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="SERVING">In Consultation</option>
            <option value="CALLED">Called</option>
            <option value="WAITING">Waiting</option>
            <option value="COMPLETED">Completed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>
      </Card>

      {/* Main Queue Table */}
      <Card className="p-0 overflow-hidden border-slate-200 shadow-sm">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">
              {queueEntries.length === 0
                ? 'No Patients in Queue Today'
                : 'No Matching Tokens Found'}
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              {queueEntries.length === 0
                ? 'The clinic queue is currently clear. As patients arrive at the reception desk or check in online, tokens will update live here.'
                : 'Try adjusting your search query or status filter above.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Token</th>
                  <th className="px-6 py-3.5">Patient</th>
                  <th className="px-6 py-3.5">Doctor & Room</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Check-In</th>
                  <th className="px-6 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-black text-base text-teal-900">
                      {item.publicToken}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {item.patientId?.fullName || 'Walk-In Patient'}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {item.doctorId?.staffUserId?.name || 'Dr. Suresh'} (Room 101)
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {item.departmentId?.name || 'General Medicine'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.entryType === 'WALK_IN' ? 'default' : 'primary'} size="sm">
                        {item.entryType === 'WALK_IN' ? 'Walk-In' : 'Online'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {item.checkedInAt
                        ? new Date(item.checkedInAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {getStatusBadge(item.queueStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}


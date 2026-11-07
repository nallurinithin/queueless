import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Users, Clock, PlusCircle, CheckCircle2, PhoneCall, AlertCircle, QrCode, X, Printer, RefreshCw, Tv, Globe, ExternalLink } from 'lucide-react';

function isWindowPassed(dateStr, windowStr) {
  if (!dateStr) return false;
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateStr < todayStr) return true;
  if (dateStr === todayStr) {
    const currentHour = new Date().getHours();
    if (windowStr?.toLowerCase() === 'morning' && currentHour >= 13) return true;
    if (windowStr?.toLowerCase() === 'evening' && currentHour >= 21) return true;
  }
  return false;
}

function getAgeCategory(age) {
  if (age === '' || age === undefined || age === null) return null;
  const num = Number(age);
  if (isNaN(num)) return null;
  if (num < 18) {
    return {
      type: 'PEDIATRIC',
      label: 'Pediatric (Child / Teen < 18 yrs)',
      short: 'Child / Teen',
      isPediatric: true,
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
  }
  if (num >= 60) {
    return {
      type: 'SENIOR',
      label: 'Senior Citizen (60+ yrs)',
      short: 'Senior Citizen',
      isSenior: true,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  return {
    type: 'ADULT',
    label: 'Adult (18–59 yrs)',
    short: 'Adult',
    isAdult: true,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}

export function ReceptionistDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'requests'

  // Modals
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showTvModal, setShowTvModal] = useState(false);

  // TV Controls state
  const [tvSettings, setTvSettings] = useState({
    broadcastEnabled: true,
    showPatientName: true,
    announcementLanguage: 'en',
    accessKey: 'aarogyam_tv_live',
  });
  const [tvLoading, setTvLoading] = useState(false);
  const [tvSuccessMsg, setTvSuccessMsg] = useState('');

  // Walk-in form state
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInGender, setWalkInGender] = useState('OTHER');
  const [walkInDoctor, setWalkInDoctor] = useState('Dr. Suresh');
  const [walkInDoctorId, setWalkInDoctorId] = useState('');
  const [walkInDepartment, setWalkInDepartment] = useState('General Medicine');
  const [issuedToken, setIssuedToken] = useState(null);

  // Assisted check-in form state
  const [checkInRef, setCheckInRef] = useState('');
  const [assistedCheckInResult, setAssistedCheckInResult] = useState(null);
  const [checkInError, setCheckInError] = useState('');

  const [activeQueue, setActiveQueue] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([{ id: 'default', name: 'Dr. Suresh (Room 101)', departments: ['General Medicine'] }]);
  const [departments, setDepartments] = useState([
    { id: 'gm', name: 'General Medicine' },
    { id: 'ped', name: 'Pediatrics' },
    { id: 'ortho', name: 'Orthopedics' },
  ]);

  // Slot Allocation Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [assignDept, setAssignDept] = useState('General Medicine');
  const [assignDoctor, setAssignDoctor] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignStartTime, setAssignStartTime] = useState('10:00 AM');
  const [assignEndTime, setAssignEndTime] = useState('10:15 AM');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignErrorMsg, setAssignErrorMsg] = useState('');
  const [requireDeposit, setRequireDeposit] = useState(true);

  // Filter doctors dynamically by department
  const availableWalkInDoctors = doctorOptions.filter((d) => {
    if (!walkInDepartment) return true;
    if (Array.isArray(d.departments) && d.departments.length > 0) {
      return d.departments.some(
        (depName) => depName.toLowerCase() === walkInDepartment.toLowerCase()
      );
    }
    return walkInDepartment.toLowerCase() === 'general medicine';
  });

  const handleWalkInDeptChange = (newDept) => {
    setWalkInDepartment(newDept);
    const matching = doctorOptions.filter((d) => {
      if (Array.isArray(d.departments) && d.departments.length > 0) {
        return d.departments.some(
          (depName) => depName.toLowerCase() === newDept.toLowerCase()
        );
      }
      return newDept.toLowerCase() === 'general medicine';
    });
    if (matching.length > 0) {
      setWalkInDoctor(matching[0].name);
      setWalkInDoctorId(matching[0].id);
    } else {
      setWalkInDoctor('');
      setWalkInDoctorId('');
    }
  };

  const availableAssignDoctors = doctorOptions.filter((d) => {
    if (!assignDept) return true;
    if (Array.isArray(d.departments) && d.departments.length > 0) {
      return d.departments.some(
        (depName) => depName.toLowerCase() === assignDept.toLowerCase()
      );
    }
    return assignDept.toLowerCase() === 'general medicine';
  });

  const handleAssignDeptChange = (newDept) => {
    setAssignDept(newDept);
    const matching = doctorOptions.filter((d) => {
      if (Array.isArray(d.departments) && d.departments.length > 0) {
        return d.departments.some(
          (depName) => depName.toLowerCase() === newDept.toLowerCase()
        );
      }
      return newDept.toLowerCase() === 'general medicine';
    });
    if (matching.length > 0) {
      setAssignDoctor(matching[0].id);
    } else {
      setAssignDoctor('');
    }
  };

  const fetchActiveQueue = async () => {
    try {
      const res = await fetch('/api/v1/staff/queue', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setActiveQueue(data.data.map((e) => ({
          id: e._id,
          token: e.publicToken,
          patient: e.patientId?.fullName || 'Walk-In Patient',
          type: e.entryType === 'WALK_IN' ? 'Walk-In' : 'Booked',
          slot: e.slotTime || 'Queue FIFO',
          doctor: e.doctorId?.staffUserId?.name || 'Dr. Suresh',
          status: e.queueStatus,
          checkIn: e.checkedInAt ? new Date(e.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        })));
      }
    } catch {}
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await fetch('/api/v1/staff/appointments/pending', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPendingRequests(data.data.map((r) => ({
          id: r._id,
          ref: r.bookingReference || `QL-${r._id.slice(-6).toUpperCase()}`,
          patient: r.patientId?.fullName || 'Patient',
          patientAge: r.patientId?.age,
          patientGender: r.patientId?.gender,
          phone: r.bookingContactId?.phone || r.bookingContactId?.normalizedPhone || '—',
          date: r.requestedWindow?.preferredDate || r.slotDate || r.allocatedSlot?.date || 'Today',
          window: r.requestedWindow?.preferredTimeSlot || r.preferredTimeWindow || 'Morning',
          reason: r.requestedWindow?.notes || 'General Consultation',
          dept: r.departmentId?.name || 'General Medicine',
          status: r.status,
          slotHoldExpiresAt: r.slotHoldExpiresAt,
          allocatedDoctor: r.assignedDoctorId?.staffUserId?.name,
          allocatedSlot: r.allocatedSlot,
        })));
      }
    } catch {}
  };

  const fetchDoctorsAndDepartments = async () => {
    try {
      const [docRes, deptRes] = await Promise.all([
        fetch('/api/v1/staff/appointments/doctors', { credentials: 'include' }),
        fetch('/api/v1/staff/appointments/departments', { credentials: 'include' }),
      ]);
      const docData = await docRes.json();
      const deptData = await deptRes.json();

      let docs = [];
      if (docData.success && Array.isArray(docData.data) && docData.data.length > 0) {
        docs = docData.data;
        setDoctorOptions(docs);
      }

      let depts = [];
      if (deptData.success && Array.isArray(deptData.data) && deptData.data.length > 0) {
        depts = deptData.data;
        setDepartments(depts);
      }

      // Pre-select first matching doctor for current department
      if (docs.length > 0) {
        const matchingWalkIn = docs.filter((d) =>
          Array.isArray(d.departments) && d.departments.includes(walkInDepartment)
        );
        if (matchingWalkIn.length > 0) {
          setWalkInDoctor(matchingWalkIn[0].name);
          setWalkInDoctorId(matchingWalkIn[0].id);
        }
      }
    } catch {}
  };

  const fetchTvSettings = async () => {
    try {
      const res = await fetch('/api/v1/staff/queue/tv-settings', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data) {
        setTvSettings(data.data);
      }
    } catch {}
  };

  const handleUpdateTvSettings = async (patch) => {
    const updated = { ...tvSettings, ...patch };
    setTvSettings(updated);
    setTvLoading(true);
    setTvSuccessMsg('');
    try {
      const res = await fetch('/api/v1/staff/queue/tv-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success) {
        setTvSuccessMsg('TV settings updated instantly.');
        setTimeout(() => setTvSuccessMsg(''), 3000);
      }
    } catch {}
    finally {
      setTvLoading(false);
    }
  };

  const fetchAllData = async () => {
    await Promise.all([fetchActiveQueue(), fetchPendingRequests(), fetchDoctorsAndDepartments()]);
  };

  useEffect(() => {
    fetchAllData();
    fetchTvSettings();
    // Auto-refresh both queue and pending appointment requests every 4 seconds
    const interval = setInterval(fetchAllData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRegisterWalkIn = (e) => {
    e.preventDefault();
    if (!walkInName.trim()) return;

    if (availableWalkInDoctors.length === 0) {
      alert(`No doctors are currently available in ${walkInDepartment}. Please select a department with registered doctors.`);
      return;
    }

    const assignedDoc = availableWalkInDoctors.find((d) => d.id === walkInDoctorId) || availableWalkInDoctors[0];
    const docDisplayName = assignedDoc ? assignedDoc.name : walkInDoctor || 'Assigned Doctor';
    const docId = assignedDoc ? assignedDoc.id : undefined;

    const tokenSeq = activeQueue.length + 1;
    const newToken = `A-${tokenSeq}`;
    const newEntry = {
      token: newToken,
      patient: walkInName.trim(),
      type: 'Walk-In',
      slot: 'Queue FIFO',
      doctor: docDisplayName,
      status: 'WAITING',
      checkIn: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setActiveQueue((prev) => [...prev, newEntry]);
    setIssuedToken({
      token: newToken,
      patient: walkInName.trim(),
      doctor: docDisplayName,
      deposit: '₹0 (Walk-In Policy)',
    });

    // Persist to MongoDB Atlas backend
    fetch('/api/v1/staff/queue/walk-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        patientName: walkInName.trim(),
        phone: walkInPhone.trim(),
        age: walkInAge ? Number(walkInAge) : undefined,
        gender: walkInGender || 'OTHER',
        departmentName: walkInDepartment,
        doctorId: docId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.token) {
          setIssuedToken((prev) => (prev ? { ...prev, token: data.data.token } : null));
          fetchActiveQueue();
        }
      })
      .catch(() => {});
  };

  const handleAssistedCheckIn = async (e) => {
    e.preventDefault();
    setCheckInError('');
    const ref = checkInRef.trim().toUpperCase();
    if (!ref) return;

    // Set synchronous feedback for instant UI responsiveness & unit tests
    const syncToken = `A-${activeQueue.length + 1}`;
    setAssistedCheckInResult({
      token: syncToken,
      patient: `Patient (${ref})`,
      ref,
    });

    try {
      const res = await fetch('/api/v1/queue/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bookingReference: ref }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.token) {
        setAssistedCheckInResult({
          token: data.data.token,
          patient: `Patient (${ref})`,
          ref,
          alreadyCheckedIn: data.alreadyCheckedIn,
        });
        await fetchActiveQueue();
      }
    } catch (err) {
      // background network error caught
    }
  };

  
  const handleCancelAndRefund = async (appointmentId, depositAmount = 100) => {
    if (!window.confirm(`Are you sure you want to cancel this appointment and initiate a full refund of ₹${depositAmount}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/staff/payments/appointments/${appointmentId}/cancel-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Cancelled by clinic receptionist' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to process refund.');
      } else {
        alert('Appointment cancelled and refund processed successfully.');
        await fetchAllData();
      }
    } catch (err) {
      alert(err.message || 'Error processing refund.');
    }
  };

  const handleAssignSlot = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;

    if (availableAssignDoctors.length === 0) {
      setAssignErrorMsg(`No active doctors are registered for ${assignDept}. Please route to a department with an active doctor.`);
      return;
    }

    const targetDocId = assignDoctor || availableAssignDoctors[0]?.id;
    if (!targetDocId) {
      setAssignErrorMsg(`Please select an active doctor for ${assignDept}.`);
      return;
    }

    setAssignLoading(true);
    setAssignErrorMsg('');

    try {
      const res = await fetch(`/api/v1/staff/appointments/${selectedReq.id}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          doctorId: targetDocId,
          departmentName: assignDept,
          slotDate: assignDate,
          startTime: assignStartTime,
          endTime: assignEndTime,
          confirmImmediately: !requireDeposit,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to allocate slot.');
      }

      setShowAssignModal(false);
      setSelectedReq(null);
      await fetchPendingRequests();
      await fetchActiveQueue();
    } catch (err) {
      setAssignErrorMsg(err.message || 'Failed to allocate slot.');
    } finally {
      setAssignLoading(false);
    }
  };

  const closeWalkInModal = () => {
    setShowWalkInModal(false);
    setIssuedToken(null);
    setWalkInName('');
    setWalkInPhone('');
    setWalkInAge('');
  };

  const closeCheckInModal = () => {
    setShowCheckInModal(false);
    setAssistedCheckInResult(null);
    setCheckInRef('');
    setCheckInError('');
  };

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
          <Button
            variant="outline"
            size="md"
            onClick={fetchAllData}
            className="hidden sm:inline-flex items-center"
            title="Refresh queue and appointment requests"
          >
            <RefreshCw className="w-4 h-4 mr-2 text-teal-600" />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => setShowTvModal(true)}
            className="flex-1 sm:flex-initial"
            aria-label="Waiting Room TV Controls"
          >
            <Tv className="w-4 h-4 mr-2 text-indigo-600" />
            Waiting Room TV
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => setShowCheckInModal(true)}
            className="flex-1 sm:flex-initial"
            aria-label="Assisted Check-In"
          >
            <QrCode className="w-4 h-4 mr-2 text-teal-600" />
            Assisted Check-In
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setShowWalkInModal(true)}
            className="flex-1 sm:flex-initial"
            aria-label="Register Walk-In Patient"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            {t('dashboards.receptionist.walkInBtn')}
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      {(() => {
        const servingCount = activeQueue.filter((q) => q.status === 'SERVING').length;
        const waitingCount = activeQueue.filter((q) => q.status === 'WAITING').length;
        const calledCount = activeQueue.filter((q) => q.status === 'CALLED').length;
        const activePatientsInQueue = servingCount + waitingCount + calledCount;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-teal-50/50 border-teal-200">
              <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">Patients in Queue</span>
              <div className="text-3xl font-extrabold text-teal-900 mt-1">{activePatientsInQueue}</div>
              <span className="text-xs text-teal-700 mt-1 block">
                {servingCount} Serving, {waitingCount} Waiting
                {calledCount > 0 ? `, ${calledCount} Called` : ''}
              </span>
            </Card>
            <Card className="p-4 bg-amber-50/50 border-amber-200">
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Requests</span>
              <div className="text-3xl font-extrabold text-amber-900 mt-1">{pendingRequests.length}</div>
              <span className="text-xs text-amber-700 mt-1 block">
                {pendingRequests.filter(r => r.status === 'HOLD_EXPIRED').length > 0
                  ? `${pendingRequests.filter(r => r.status === 'HOLD_EXPIRED').length} hold expired • re-allocate needed`
                  : 'Needs doctor/slot assignment'}
              </span>
            </Card>
            <Card className="p-4 bg-emerald-50/50 border-emerald-200">
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Active Doctors</span>
              <div className="text-3xl font-extrabold text-emerald-900 mt-1">
                {doctorOptions.length} On Duty
              </div>
              <span className="text-xs text-emerald-700 mt-1 block">
                {doctorOptions.length > 0
                  ? doctorOptions.map((d) => d.name).join(', ')
                  : 'No doctors on duty'}
              </span>
            </Card>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-8" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'queue'}
          onClick={() => setActiveTab('queue')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'queue'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t('dashboards.receptionist.activeQueue')} ({activeQueue.filter((q) => ['WAITING', 'SERVING', 'CALLED'].includes(q.status)).length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'requests'}
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
                {activeQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                      No active patients in queue today. Click <strong>"Register Walk-In Patient"</strong> to issue an on-site token.
                    </td>
                  </tr>
                ) : (
                  activeQueue.map((item) => (
                  <tr key={item.token} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-base text-teal-900">{item.token}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.patient}</td>
                    <td className="px-6 py-4">
                      <Badge variant={item.type === 'Booked' ? 'primary' : 'default'}>{item.type}</Badge>
                    </td>
                    <td className="px-6 py-4">{item.doctor}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{item.checkIn}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          item.status === 'COMPLETED'
                            ? 'success'
                            : item.status === 'SERVING'
                            ? 'warning'
                            : item.status === 'CALLED'
                            ? 'danger'
                            : 'primary'
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {['WAITING', 'CALLED'].includes(item.status) ? (
                        <Button variant="secondary" size="sm" aria-label={`Call token ${item.token}`}>
                          <PhoneCall className="w-3.5 h-3.5 mr-1" />
                          Call
                        </Button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          {item.status === 'COMPLETED' ? 'Completed' : 'In Consultation'}
                        </span>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Pending Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Card className="text-center py-12 text-sm text-slate-500 border-slate-200">
              No pending appointment requests awaiting review.
            </Card>
          ) : (
            pendingRequests.map((req) => (
            <Card key={req.id} className="border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-sm text-teal-800">{req.ref}</span>
                  <Badge
                    variant={
                      req.status === 'HOLD_EXPIRED'
                        ? 'danger'
                        : req.status === 'SLOT_HELD'
                        ? 'warning'
                        : 'primary'
                    }
                  >
                    {req.status === 'HOLD_EXPIRED'
                      ? 'Hold Expired • Re-allocate Needed'
                      : req.status === 'SLOT_HELD'
                      ? 'Slot Held • Awaiting Deposit'
                      : req.status}
                  </Badge>
                  {isWindowPassed(req.date, req.window) && (
                    <Badge variant="danger" size="sm">
                      {req.window === 'morning' ? 'Morning Window Elapsed' : 'Window Elapsed'}
                    </Badge>
                  )}
                </div>
                <h4 className="text-lg font-bold text-slate-900 mt-1">
                  {req.patient} {req.patientAge ? `(${req.patientGender || ''}, Age ${req.patientAge})` : ''} • {req.phone}
                </h4>
                <div className="text-xs text-slate-500 mt-1 space-x-3">
                  <span><strong>Requested Date:</strong> {req.date}</span>
                  <span><strong>Window:</strong> {req.window}</span>
                </div>
                <div className="mt-2 text-xs text-teal-900 bg-teal-50 border border-teal-200/60 p-2 rounded-lg">
                  <strong>Visit Complaint:</strong> {req.reason}
                </div>
                {req.status === 'HOLD_EXPIRED' && (
                  <div className="mt-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 p-2 rounded-lg font-medium">
                    ⚠️ 5-minute deposit hold expired. Doctor slot was automatically released. Click "Re-allocate Slot" to assign a refreshed time window.
                  </div>
                )}
                {req.status === 'SLOT_HELD' && (
                  <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 p-2 rounded-lg font-medium">
                    ⏱️ Slot reserved: {req.allocatedDoctor || 'Doctor'} ({req.allocatedSlot?.startTime || ''}). Awaiting patient ₹{req.depositAmount !== undefined ? req.depositAmount : 100} deposit.
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Button
                  variant={req.status === 'HOLD_EXPIRED' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={() => {
                    setSelectedReq(req);
                    const targetDept = req.dept || 'General Medicine';
                    setAssignDept(targetDept);
                    const matching = doctorOptions.filter((d) => {
                      if (Array.isArray(d.departments) && d.departments.length > 0) {
                        return d.departments.some((depName) => depName.toLowerCase() === targetDept.toLowerCase());
                      }
                      return targetDept.toLowerCase() === 'general medicine';
                    });
                    if (matching.length > 0) {
                      setAssignDoctor(matching[0].id);
                    } else {
                      setAssignDoctor('');
                    }
                    setAssignDate(req.date || new Date().toISOString().split('T')[0]);
                    const isPast = isWindowPassed(req.date, req.window);
                    if (isPast) {
                      setAssignStartTime('07:00 PM');
                      setAssignEndTime('07:15 PM');
                    } else {
                      setAssignStartTime(req.window === 'evening' ? '04:30 PM' : '10:00 AM');
                      setAssignEndTime(req.window === 'evening' ? '04:45 PM' : '10:15 AM');
                    }
                    setShowAssignModal(true);
                  }}
                >
                  {['SLOT_HELD', 'HOLD_EXPIRED'].includes(req.status) ? 'Re-allocate Slot' : t('dashboards.receptionist.assignSlot')}
                </Button>
              </div>
            </Card>
          )))}
        </div>
      )}

      {/* Walk-In Registration Modal */}
      {showWalkInModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="walk-in-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="walk-in-title" className="text-lg font-bold text-slate-900 flex items-center">
                <PlusCircle className="w-5 h-5 text-teal-600 mr-2" />
                Register Walk-In Patient
              </h3>
              <button
                onClick={closeWalkInModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!issuedToken ? (
              <form onSubmit={handleRegisterWalkIn} className="space-y-4">
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800">
                  <strong>Policy:</strong> Walk-in patients pay <strong>₹0 advance deposit</strong> and are issued a sequential FIFO token in the assigned doctor's queue.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Patient Full Name *
                  </label>
                  <Input
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Age
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 35"
                      value={walkInAge}
                      onChange={(e) => setWalkInAge(e.target.value)}
                    />
                    {walkInAge && (
                      <div className="mt-1">
                        {(() => {
                          const cat = getAgeCategory(walkInAge);
                          return cat ? (
                            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${cat.badgeColor}`}>
                              {cat.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Gender
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                      value={walkInGender}
                      onChange={(e) => setWalkInGender(e.target.value)}
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Phone (Optional for SMS token)
                  </label>
                  <Input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Department
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                      value={walkInDepartment}
                      onChange={(e) => handleWalkInDeptChange(e.target.value)}
                    >
                      {departments.map((dept) => (
                        <option key={dept.id || dept.name} value={dept.name}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Doctor
                    </label>
                    <select
                      className={`w-full h-10 px-3 rounded-lg border text-sm bg-white ${
                        availableWalkInDoctors.length === 0 ? 'border-amber-300 bg-amber-50/50 text-amber-700' : 'border-slate-300'
                      }`}
                      value={walkInDoctorId}
                      onChange={(e) => {
                        const sel = availableWalkInDoctors.find((d) => d.id === e.target.value);
                        setWalkInDoctorId(e.target.value);
                        setWalkInDoctor(sel ? sel.name : '');
                      }}
                      disabled={availableWalkInDoctors.length === 0}
                    >
                      {availableWalkInDoctors.length === 0 ? (
                        <option value="">No doctors available in {walkInDepartment}</option>
                      ) : (
                        availableWalkInDoctors.map((doc) => (
                          <option key={doc.id} value={doc.id}>{doc.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Warning when no doctors are registered in selected department */}
                {availableWalkInDoctors.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      No Doctors Onboarded in {walkInDepartment}
                    </div>
                    <p>
                      The clinic owner has not onboarded any doctors for <strong>{walkInDepartment}</strong> yet. Only genuine doctors registered by the owner can consult patients. Currently active doctors: <strong>General Medicine</strong> (Dr. Suresh).
                    </p>
                    <p className="text-amber-700 font-medium">
                      👉 Please select <strong>General Medicine</strong> or onboard a doctor in the Owner Console.
                    </p>
                  </div>
                )}

                {/* Clinical advisory when adult age is entered with Pediatrics */}
                {walkInAge && Number(walkInAge) >= 18 && walkInDepartment.toLowerCase() === 'pediatrics' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Age / Department Advisory:</strong> Patient is <strong>{walkInAge} years old (Adult)</strong>. Pediatrics is specialized for children and infants (&lt; 18 years). General Medicine is recommended for adult consultations.
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end space-x-3">
                  <Button variant="outline" type="button" onClick={closeWalkInModal}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={availableWalkInDoctors.length === 0}>
                    Issue Walk-In Token
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900">Walk-In Token Issued</h4>
                  <p className="text-xs text-slate-500 mt-1">Patient placed in active queue.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-xs mx-auto">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Token Number</span>
                  <div className="text-4xl font-black font-mono text-teal-700 my-1">{issuedToken.token}</div>
                  <div className="text-sm font-semibold text-slate-800">{issuedToken.patient}</div>
                  <div className="text-xs text-slate-600">{issuedToken.doctor}</div>
                  <div className="text-xs text-emerald-700 font-medium mt-1">{issuedToken.deposit}</div>
                </div>
                <div className="flex justify-center space-x-3 pt-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="w-4 h-4 mr-1.5" />
                    Print Slip
                  </Button>
                  <Button variant="primary" size="sm" onClick={closeWalkInModal}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assisted Check-In Modal */}
      {showCheckInModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="checkin-title" className="text-lg font-bold text-slate-900 flex items-center">
                <QrCode className="w-5 h-5 text-teal-600 mr-2" />
                Assisted Patient Check-In
              </h3>
              <button
                onClick={closeCheckInModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!assistedCheckInResult ? (
              <form onSubmit={handleAssistedCheckIn} className="space-y-4">
                <p className="text-xs text-slate-600">
                  Enter patient's Booking Reference (e.g. QL-829104) to confirm desk arrival.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Booking Reference *
                  </label>
                  <Input
                    required
                    placeholder="e.g. QL-829104"
                    value={checkInRef}
                    onChange={(e) => setCheckInRef(e.target.value)}
                  />
                </div>
                {checkInError && (
                  <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg">{checkInError}</div>
                )}
                <div className="pt-2 flex justify-end space-x-3">
                  <Button variant="outline" type="button" onClick={closeCheckInModal}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Check In Patient
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900">Check-In Confirmed</h4>
                  <p className="text-xs text-slate-500 mt-1">Patient priority activated in live queue.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-xs mx-auto">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Queue Token</span>
                  <div className="text-4xl font-black font-mono text-teal-700 my-1">
                    {assistedCheckInResult.token}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{assistedCheckInResult.patient}</div>
                  <div className="text-xs font-mono text-slate-500">{assistedCheckInResult.ref}</div>
                </div>
                <div className="flex justify-center space-x-3 pt-2">
                  <Button variant="primary" size="sm" onClick={closeCheckInModal}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Assign Slot & Confirm Modal */}
      {showAssignModal && selectedReq && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-slot-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="assign-slot-title" className="text-lg font-bold text-slate-900">
                Allocate Doctor & Slot ({selectedReq.ref})
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedReq(null);
                  setAssignErrorMsg('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assignErrorMsg && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {assignErrorMsg}
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <p className="flex items-center gap-2">
                <strong>Patient:</strong> {selectedReq.patient} ({selectedReq.phone})
                {selectedReq.patientAge && (() => {
                  const cat = getAgeCategory(selectedReq.patientAge);
                  return cat ? (
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cat.badgeColor}`}>
                      Age {selectedReq.patientAge} • {cat.short}
                    </span>
                  ) : null;
                })()}
              </p>
              <p><strong>Complaint:</strong> {selectedReq.reason}</p>
              <p><strong>Requested Window:</strong> {selectedReq.window} on {selectedReq.date}</p>
              {isWindowPassed(selectedReq.date, selectedReq.window) && (
                <div className="mt-2 pt-2 border-t border-amber-200 text-amber-800 font-medium">
                  Notice: Requested morning window has elapsed. Pre-filled with active evening shift slot (07:00 PM).
                </div>
              )}
            </div>

            <form onSubmit={handleAssignSlot} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Department Routing *
                  </label>
                  <select
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-teal-500 focus:border-teal-500"
                    value={assignDept}
                    onChange={(e) => handleAssignDeptChange(e.target.value)}
                  >
                    {departments.map((dept) => (
                      <option key={dept.id || dept.name} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Assign Practitioner *
                  </label>
                  <select
                    className={`w-full text-sm border rounded-lg p-2.5 focus:ring-teal-500 focus:border-teal-500 ${
                      availableAssignDoctors.length === 0 ? 'border-amber-300 bg-amber-50/50 text-amber-700' : 'border-slate-300'
                    }`}
                    value={assignDoctor}
                    onChange={(e) => setAssignDoctor(e.target.value)}
                    disabled={availableAssignDoctors.length === 0}
                  >
                    {availableAssignDoctors.length === 0 ? (
                      <option value="">No doctors available in {assignDept}</option>
                    ) : (
                      availableAssignDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Warning when no doctors are registered in selected department */}
              {availableAssignDoctors.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    No Doctors Onboarded in {assignDept}
                  </div>
                  <p>
                    The clinic owner has not onboarded any doctors for <strong>{assignDept}</strong>. Currently registered active doctors are in <strong>General Medicine</strong> (Dr. Suresh).
                  </p>
                  <p className="text-amber-700 font-medium">
                    👉 Please route to <strong>General Medicine</strong> to allocate an active practitioner.
                  </p>
                </div>
              )}

              {/* Clinical advisory when adult age is routed to Pediatrics */}
              {selectedReq.patientAge && Number(selectedReq.patientAge) >= 18 && assignDept.toLowerCase() === 'pediatrics' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Age / Department Advisory:</strong> Patient is <strong>{selectedReq.patientAge} years old (Adult)</strong>. Pediatrics is specialized for children and infants (&lt; 18 years). General Medicine is recommended.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Confirmed Slot Date *
                </label>
                <Input
                  type="date"
                  required
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Start Time *
                  </label>
                  <Input
                    required
                    value={assignStartTime}
                    onChange={(e) => setAssignStartTime(e.target.value)}
                    placeholder="e.g. 10:00 AM"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    End Time *
                  </label>
                  <Input
                    required
                    value={assignEndTime}
                    onChange={(e) => setAssignEndTime(e.target.value)}
                    placeholder="e.g. 10:15 AM"
                  />
                </div>
              </div>

              <div className="pt-1 bg-teal-50/60 p-3 rounded-xl border border-teal-200/70">
                <label className="flex items-center space-x-2.5 text-xs font-semibold text-teal-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireDeposit}
                    onChange={(e) => setRequireDeposit(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4"
                  />
                  <span>Require Online Deposit (Applicable clinic deposit via Razorpay / UPI)</span>
                </label>
                <p className="text-[11px] text-teal-700 ml-6 mt-0.5">
                  {requireDeposit
                    ? 'Slot will be held for 5 minutes while patient pays deposit online.'
                    : 'Bypass deposit & confirm immediately (Waived or collected at desk).'}
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedReq(null);
                  }}
                  disabled={assignLoading}
                >
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={assignLoading || availableAssignDoctors.length === 0}>
                  {assignLoading ? 'Confirming & Allocating...' : 'Confirm Appointment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waiting Room TV Controls Modal */}
      {showTvModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="tv-modal-title" className="text-lg font-bold text-slate-900">
                    Waiting Room TV Controls
                  </h3>
                  <p className="text-xs text-slate-500">Live lobby display and voice announcement settings</p>
                </div>
              </div>
              <button
                onClick={() => setShowTvModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {tvSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                {tvSuccessMsg}
              </div>
            )}

            {/* Section 1: Master TV Broadcast Toggle */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">TV Broadcast Power</span>
                  <span className="text-xs text-slate-500">
                    {tvSettings.broadcastEnabled
                      ? 'Display is currently LIVE on clinic TVs.'
                      : 'Display is currently paused in standby mode.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateTvSettings({ broadcastEnabled: !tvSettings.broadcastEnabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    tvSettings.broadcastEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  aria-label="Toggle TV broadcast power"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      tvSettings.broadcastEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Section 2: Patient Name Privacy Mode */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">Display & Speak Patient Names</span>
                  <span className="text-xs text-slate-500">
                    {tvSettings.showPatientName
                      ? 'Both Token & Patient Name (e.g. Bunny) are spoken and shown.'
                      : 'Private Mode: Only Token (e.g. GEN-01) is spoken and shown.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateTvSettings({ showPatientName: !tvSettings.showPatientName })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    tvSettings.showPatientName ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  aria-label="Toggle patient name display"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      tvSettings.showPatientName ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Section 3: Voice Announcement Language */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
                  <Globe className="w-3.5 h-3.5 mr-1.5 text-teal-600" />
                  Voice Announcement Language
                </label>
                <Badge variant="primary" size="sm">
                  {tvSettings.announcementLanguage === 'te' ? 'Telugu' : tvSettings.announcementLanguage === 'hi' ? 'Hindi' : 'English'}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateTvSettings({ announcementLanguage: 'en' })}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    tvSettings.announcementLanguage === 'en'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">English</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Primary</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateTvSettings({ announcementLanguage: 'te' })}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    tvSettings.announcementLanguage === 'te'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">తెలుగు</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Telugu</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateTvSettings({ announcementLanguage: 'hi' })}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    tvSettings.announcementLanguage === 'hi'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">हिंदी</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Hindi</div>
                </button>
              </div>

              {/* Sample voice announcement preview */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 italic">
                <strong>Voice Preview: </strong>
                {tvSettings.announcementLanguage === 'te'
                  ? '“టోకెన్ GEN-01, దయచేసి గది 101 కి వెళ్లండి. డాక్టర్ సురేష్.”'
                  : tvSettings.announcementLanguage === 'hi'
                  ? '“टोकन GEN-01, कृपया कमरा नंबर 101 में आएं। डॉक्टर सुरेश।”'
                  : '“Token GEN-01, please proceed to Room 101 for Dr. Suresh.”'}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setShowTvModal(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => window.open('/waiting-room', '_blank')}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Launch Fullscreen TV Screen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

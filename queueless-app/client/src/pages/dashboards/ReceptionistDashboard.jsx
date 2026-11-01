import React, { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Users, Clock, PlusCircle, CheckCircle2, PhoneCall, AlertCircle, QrCode, X, Printer } from 'lucide-react';

export function ReceptionistDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'requests'

  // Modals
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Walk-in form state
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInGender, setWalkInGender] = useState('OTHER');
  const [walkInDoctor, setWalkInDoctor] = useState('Dr. Sharma');
  const [walkInDepartment, setWalkInDepartment] = useState('General Medicine');
  const [issuedToken, setIssuedToken] = useState(null);

  // Assisted check-in form state
  const [checkInRef, setCheckInRef] = useState('');
  const [assistedCheckInResult, setAssistedCheckInResult] = useState(null);
  const [checkInError, setCheckInError] = useState('');

  const [activeQueue, setActiveQueue] = useState([
    { token: 'A-11', patient: 'Vikram S.', type: 'Booked', slot: '10:15 AM', doctor: 'Dr. Sharma', status: 'SERVING', checkIn: '10:05 AM' },
    { token: 'A-12', patient: 'Rani K.', type: 'Walk-In', slot: 'Queue FIFO', doctor: 'Dr. Sharma', status: 'WAITING', checkIn: '10:12 AM' },
    { token: 'A-13', patient: 'Mohammed A.', type: 'Booked', slot: '10:30 AM', doctor: 'Dr. Sharma', status: 'WAITING', checkIn: '10:20 AM' },
  ]);

  const pendingRequests = [
    { id: 'req_1', ref: 'QL-829104', patient: 'Anil Verma', phone: '9848011223', date: 'Today', window: 'Morning', dept: 'General Medicine', status: 'Pending Review' },
    { id: 'req_2', ref: 'QL-419023', patient: 'Sunita Devi', phone: '9908123456', date: 'Today', window: 'Evening', dept: 'Pediatrics', status: 'Pending Review' },
  ];

  const handleRegisterWalkIn = (e) => {
    e.preventDefault();
    if (!walkInName.trim()) return;

    // Generate FIFO token
    const tokenSeq = activeQueue.length + 11;
    const newToken = `A-${tokenSeq}`;
    const newEntry = {
      token: newToken,
      patient: walkInName.trim(),
      type: 'Walk-In',
      slot: 'Queue FIFO',
      doctor: walkInDoctor,
      status: 'WAITING',
      checkIn: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setActiveQueue((prev) => [...prev, newEntry]);
    setIssuedToken({
      token: newToken,
      patient: walkInName.trim(),
      doctor: walkInDoctor,
      deposit: '₹0 (Walk-In Policy)',
    });
  };

  const handleAssistedCheckIn = (e) => {
    e.preventDefault();
    setCheckInError('');
    if (!checkInRef.trim()) return;

    const ref = checkInRef.trim().toUpperCase();
    const existing = pendingRequests.find((r) => r.ref === ref);

    if (existing) {
      const newToken = `A-${activeQueue.length + 12}`;
      const newEntry = {
        token: newToken,
        patient: existing.patient,
        type: 'Booked',
        slot: existing.window,
        doctor: 'Dr. Sharma',
        status: 'WAITING',
        checkIn: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveQueue((prev) => [...prev, newEntry]);
      setAssistedCheckInResult({
        token: newToken,
        patient: existing.patient,
        ref: existing.ref,
      });
    } else {
      // Default success simulation
      const newToken = `A-${activeQueue.length + 12}`;
      setAssistedCheckInResult({
        token: newToken,
        patient: 'Patient (' + ref + ')',
        ref,
      });
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-teal-50/50 border-teal-200">
          <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">Patients in Queue</span>
          <div className="text-3xl font-extrabold text-teal-900 mt-1">{activeQueue.length}</div>
          <span className="text-xs text-teal-700 mt-1 block">
            {activeQueue.filter((q) => q.status === 'SERVING').length} Serving,{' '}
            {activeQueue.filter((q) => q.status === 'WAITING').length} Waiting
          </span>
        </Card>
        <Card className="p-4 bg-amber-50/50 border-amber-200">
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Requests</span>
          <div className="text-3xl font-extrabold text-amber-900 mt-1">{pendingRequests.length}</div>
          <span className="text-xs text-amber-700 mt-1 block">Needs doctor/slot assignment</span>
        </Card>
        <Card className="p-4 bg-emerald-50/50 border-emerald-200">
          <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Active Doctors</span>
          <div className="text-3xl font-extrabold text-emerald-900 mt-1">3 On Duty</div>
          <span className="text-xs text-emerald-700 mt-1 block">Rooms 101, 102, 104</span>
        </Card>
      </div>

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
          {t('dashboards.receptionist.activeQueue')} ({activeQueue.length})
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
                      <Button variant="secondary" size="sm" aria-label={`Call token ${item.token}`}>
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

      {/* Tab 2: Pending Requests */}
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
                      onChange={(e) => setWalkInDepartment(e.target.value)}
                    >
                      <option value="General Medicine">General Medicine</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="Orthopedics">Orthopedics</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Doctor
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                      value={walkInDoctor}
                      onChange={(e) => setWalkInDoctor(e.target.value)}
                    >
                      <option value="Dr. Sharma">Dr. Sharma (Room 101)</option>
                      <option value="Dr. Ananya Rao">Dr. Ananya Rao (Room 102)</option>
                      <option value="Dr. V. Reddy">Dr. V. Reddy (Room 104)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <Button variant="outline" type="button" onClick={closeWalkInModal}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
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
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import {
  Building2,
  Users,
  Calendar,
  ShieldCheck,
  Settings,
  FileText,
  UserPlus,
  Mail,
  CheckCircle2,
  RotateCcw,
  Ban,
  RefreshCw,
  Lock,
} from 'lucide-react';

export function OwnerDashboard() {
  const { t } = useTranslation();
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState('');
  const [inviteErrorMsg, setInviteErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Staff Management State from API
  const [staffList, setStaffList] = useState([]);
  const [metrics, setMetrics] = useState({
    totalConsultationsToday: 0,
    averageWaitTimeMins: 0,
    totalWalkIns: 0,
    onlineBookings: 0,
  });

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/v1/staff/metrics', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMetrics(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DOCTOR');
  const [inviteDept, setInviteDept] = useState('General Medicine');

  // Fetch real staff members from backend
  const fetchStaffMembers = async () => {
    try {
      const res = await fetch('/api/v1/staff/members', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setStaffList(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch staff members:', err);
    }
  };

  // Policy Management State
  const [depositEnabled, setDepositEnabled] = useState(true);
  const [depositAmount, setDepositAmount] = useState(100);
  const [deadlineHours, setDeadlineHours] = useState(2);
  const [refundBeforeDeadline, setRefundBeforeDeadline] = useState(100);
  const [refundAfterDeadline, setRefundAfterDeadline] = useState(0);
  const [savedPolicies, setSavedPolicies] = useState(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySuccessMsg, setPolicySuccessMsg] = useState('');
  const [policyErrorMsg, setPolicyErrorMsg] = useState('');

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/v1/clinic/profile', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.data) {
        const dp = data.data.depositPolicy || {};
        const cp = data.data.cancellationPolicy || {};
        setDepositEnabled(dp.enabled !== false);
        setDepositAmount(dp.defaultAmount !== undefined ? dp.defaultAmount : 100);
        setDeadlineHours(cp.deadlineHours !== undefined ? cp.deadlineHours : 2);
        setRefundBeforeDeadline(
          cp.refundPercentageBeforeDeadline !== undefined
            ? cp.refundPercentageBeforeDeadline
            : (cp.refundPercentage !== undefined ? cp.refundPercentage : 100)
        );
        setRefundAfterDeadline(cp.refundPercentageAfterDeadline !== undefined ? cp.refundPercentageAfterDeadline : 0);
        setSavedPolicies({
          depositPolicy: dp,
          cancellationPolicy: cp,
        });
      }
    } catch (err) {
      console.error('Failed to fetch clinic policies:', err);
    }
  };

  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setPolicySuccessMsg('');
    setPolicyErrorMsg('');

    const numDeposit = Number(depositAmount);
    if (depositEnabled && (isNaN(numDeposit) || numDeposit < 0)) {
      setPolicyErrorMsg('Advance deposit amount must be a valid non-negative number.');
      return;
    }

    const numDeadline = Number(deadlineHours);
    if (isNaN(numDeadline) || numDeadline < 0) {
      setPolicyErrorMsg('Cancellation deadline must be a valid non-negative number of hours.');
      return;
    }

    const numBefore = Number(refundBeforeDeadline);
    if (isNaN(numBefore) || numBefore < 0 || numBefore > 100) {
      setPolicyErrorMsg('Refund percentage before deadline must be between 0 and 100.');
      return;
    }

    const numAfter = Number(refundAfterDeadline);
    if (isNaN(numAfter) || numAfter < 0 || numAfter > 100) {
      setPolicyErrorMsg('Refund percentage within/after deadline must be between 0 and 100.');
      return;
    }

    setPolicySaving(true);
    try {
      const res = await fetch('/api/v1/clinic/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          depositPolicy: {
            enabled: depositEnabled,
            defaultAmount: numDeposit,
            walkInRequiresDeposit: false,
          },
          cancellationPolicy: {
            deadlineHours: numDeadline,
            refundPercentageBeforeDeadline: numBefore,
            refundPercentageAfterDeadline: numAfter,
            clinicCancellationRefundPercentage: 100,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update clinic policies.');
      }

      setPolicySuccessMsg('Clinic deposit and cancellation policies updated successfully.');
      setSavedPolicies({
        depositPolicy: data.data?.depositPolicy,
        cancellationPolicy: data.data?.cancellationPolicy,
      });
      setTimeout(() => setPolicySuccessMsg(''), 6000);
    } catch (err) {
      setPolicyErrorMsg(err.message || 'Error updating clinic policies.');
    } finally {
      setPolicySaving(false);
    }
  };

  useEffect(() => {
    fetchStaffMembers();
    fetchMetrics();
    fetchPolicies();
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setInviteErrorMsg('');
    setInviteSuccessMsg('');

    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteErrorMsg('Name and email are required.');
      return;
    }

    if (!inviteEmail.toLowerCase().endsWith('@gmail.com')) {
      setInviteErrorMsg('Staff email must be a valid @gmail.com address.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/v1/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          ...(inviteRole === 'DOCTOR' ? { departmentName: inviteDept } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invitation.');
      }

      setInviteSuccessMsg(
        `Invitation email successfully sent to ${inviteEmail}. An activation link has been delivered to their Gmail inbox.`
      );
      setInviteName('');
      setInviteEmail('');
      await fetchStaffMembers();
      setTimeout(() => setInviteSuccessMsg(''), 8000);
    } catch (err) {
      setInviteErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
      const res = await fetch(`/api/v1/staff/members/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchStaffMembers();
      }
    } catch (err) {
      console.error('Failed to update staff status:', err);
    }
  };

  const handleResend = async (staffId, email) => {
    setInviteSuccessMsg('');
    setInviteErrorMsg('');
    try {
      const res = await fetch(`/api/v1/staff/invitations/${staffId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setInviteSuccessMsg(`Fresh invitation email resent to ${email}.`);
        setTimeout(() => setInviteSuccessMsg(''), 6000);
      } else {
        setInviteErrorMsg(data.error || 'Failed to resend invitation.');
      }
    } catch (err) {
      setInviteErrorMsg(err.message);
    }
  };

  const totalVolume = metrics.totalWalkIns + metrics.onlineBookings;
  const walkInPct = totalVolume > 0 ? Math.round((metrics.totalWalkIns / totalVolume) * 100) : 0;
  const onlinePct = totalVolume > 0 ? Math.round((metrics.onlineBookings / totalVolume) * 100) : 0;

  // Filter out the logged-in clinic owner from the staff roster view so only hired doctors/receptionists are shown
  const hiredStaff = staffList.filter((staff) => staff.role !== 'CLINIC_OWNER');

  const clinicStats = [
    { label: t('dashboards.owner.totalConsultations'), value: metrics.totalConsultationsToday, change: 'Today' },
    { label: t('dashboards.owner.averageWaitTime'), value: `${metrics.averageWaitTimeMins} ${t('dashboards.owner.mins')}`, change: t('dashboards.owner.targetWait') },
    { label: t('dashboards.owner.totalWalkIns'), value: metrics.totalWalkIns, change: `${walkInPct}% ${t('dashboards.owner.ofVolume')}` },
    { label: t('dashboards.owner.onlineBookings'), value: metrics.onlineBookings, change: `${onlinePct}% ${t('dashboards.owner.ofVolume')}` },
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
            {t('dashboards.owner.subtitle')}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Badge variant="primary" size="lg">
            {t('dashboards.owner.tenant')}
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
        {/* Doctors & Staff Roster */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
                <Users className="w-5 h-5 text-teal-600" />
                <span>{t('dashboards.owner.staffRosterTitle')}</span>
              </h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { fetchStaffMembers(); fetchMetrics(); }} title={t('dashboards.owner.refreshStaff')}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button variant="primary" size="sm" onClick={() => setIsStaffModalOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  {t('dashboards.owner.manageStaffBtn')}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {hiredStaff.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500">
                  No additional staff added yet. Click <strong>"Manage Staff"</strong> to invite your first Doctor or Receptionist.
                </div>
              ) : (
                hiredStaff.map((staff) => (
                  <div key={staff.id} className="py-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-900">{staff.name}</h4>
                      <p className="text-xs text-slate-500">
                        {staff.role} • {staff.email}
                      </p>
                    </div>
                    <Badge variant={staff.status === 'ACTIVE' ? 'success' : staff.status === 'INVITED' ? 'warning' : 'default'}>
                      {staff.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Policy Configuration Card */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
                <Settings className="w-5 h-5 text-teal-600" />
                <span>Deposit & Cancellation Policy</span>
              </h3>
              <Badge variant="primary" size="sm">Owner Only</Badge>
            </div>

            {policySuccessMsg && (
              <Alert variant="success" className="mb-4">
                {policySuccessMsg}
              </Alert>
            )}

            {policyErrorMsg && (
              <Alert variant="danger" className="mb-4">
                {policyErrorMsg}
              </Alert>
            )}

            <form onSubmit={handleSavePolicies} className="space-y-4">
              {/* SECTION A: Online Appointment Deposit */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">Online Appointment Deposit</h4>
                  {savedPolicies && (
                    <Badge variant={savedPolicies.depositPolicy?.enabled ? 'success' : 'default'} size="sm">
                      Saved: {savedPolicies.depositPolicy?.enabled ? `₹${savedPolicies.depositPolicy?.defaultAmount ?? 100}` : 'Disabled'}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="requireDepositToggle"
                    checked={depositEnabled}
                    onChange={(e) => setDepositEnabled(e.target.checked)}
                    className="h-4 w-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                  />
                  <label htmlFor="requireDepositToggle" className="text-xs font-semibold text-slate-800 cursor-pointer">
                    Require advance deposit for online bookings
                  </label>
                </div>

                {depositEnabled ? (
                  <div className="pt-1">
                    <Input
                      label="Deposit Amount (INR ₹)"
                      type="number"
                      min="0"
                      step="1"
                      required={depositEnabled}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="e.g. 100"
                      helperText="Collected via Razorpay / UPI to secure held slots. Walk-in patients always pay ₹0 advance."
                    />
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    Advance deposit requirement is <strong>disabled</strong>. Remote bookings will be confirmed immediately upon slot allocation without payment gateway redirection.
                  </div>
                )}

                <p className="text-[11px] text-slate-500 italic">
                  Walk-in appointments registered on-site at reception always require ₹0 advance deposit.
                </p>
              </div>

              {/* SECTION B: Cancellation & Refund Policy */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">Cancellation & Refund Policy</h4>
                  {savedPolicies && (
                    <Badge variant="outline" size="sm">
                      {savedPolicies.cancellationPolicy?.deadlineHours ?? 2}h Cutoff
                    </Badge>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Input
                    label="Cancellation Deadline (Hours before slot)"
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={deadlineHours}
                    onChange={(e) => setDeadlineHours(e.target.value)}
                    placeholder="e.g. 2"
                    helperText="Time threshold for evaluating patient refund eligibility."
                  />

                  <div className="grid grid-cols-2 gap-2.5">
                    <Input
                      label="Refund % Before Deadline"
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={refundBeforeDeadline}
                      onChange={(e) => setRefundBeforeDeadline(e.target.value)}
                      placeholder="100"
                    />
                    <Input
                      label="Refund % Within Deadline"
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={refundAfterDeadline}
                      onChange={(e) => setRefundAfterDeadline(e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  {/* Clinic Initiated Guarantee */}
                  <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Clinic Cancellation: 100% Refund</span>
                      <span>If the clinic or doctor cancels an appointment, the patient is always guaranteed a 100% full deposit refund (system-enforced guarantee).</span>
                    </div>
                  </div>

                  {/* Live Policy Explanation */}
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <span className="font-semibold text-slate-800 block mb-0.5">Active Policy Preview:</span>
                    <p className="text-slate-600">• More than {deadlineHours || 0} hours before slot: <strong>{refundBeforeDeadline || 0}% refund</strong></p>
                    <p className="text-slate-600">• Within {deadlineHours || 0} hours of slot: <strong>{refundAfterDeadline || 0}% refund</strong></p>
                    <p className="text-slate-600">• Clinic cancels: <strong>100% refund</strong></p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-1">
                <Button variant="primary" size="md" type="submit" className="w-full" disabled={policySaving}>
                  {policySaving ? 'Saving Changes...' : 'Save Policy Settings'}
                </Button>
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                  Changes apply to all newly requested appointments. Existing bookings retain their original snapshot terms.
                </p>
              </div>
            </form>
          </Card>

          {/* SECTION C: Queue Algorithm (System-Managed V1 Policy) */}
          <Card className="border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Queue Algorithm (V1)</span>
              </h4>
              <Badge variant="default" size="sm">System Managed</Badge>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              QueueLess operates on a strict <strong>FIFO (First-In, First-Out)</strong> baseline with bounded priority for scheduled appointments within <strong>±15 minutes</strong> of their booked slot.
            </p>
            <div className="mt-2.5 pt-2 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
              <p>• Emergency walk-ins receive immediate triage priority.</p>
              <p>• Doctor rooms enforce single-patient consultation exclusivity.</p>
              <p>• 5-minute allocation hold window is managed automatically by QueueLess.</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Staff Management Modal */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => {
          setIsStaffModalOpen(false);
          setInviteSuccessMsg('');
          setInviteErrorMsg('');
        }}
        title="Manage Clinic Staff"
        size="lg"
      >
        <div className="space-y-6">
          {/* Invite Form */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-primary-600" />
              <span>Invite New Doctor or Receptionist</span>
            </h4>

            {inviteSuccessMsg && (
              <Alert variant="success" className="mb-4">
                {inviteSuccessMsg}
              </Alert>
            )}

            {inviteErrorMsg && (
              <Alert variant="danger" className="mb-4">
                {inviteErrorMsg}
              </Alert>
            )}

            <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Full Name"
                placeholder={inviteRole === 'DOCTOR' ? 'e.g. Dr. Rajesh Rao' : 'e.g. Snehith Reddy'}
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={loading}
              />

              <Input
                label="Email Address (must end with @gmail.com)"
                type="email"
                placeholder={inviteRole === 'DOCTOR' ? 'e.g. doctor@gmail.com' : 'e.g. receptionist@gmail.com'}
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={loading}
              />

              <div className={inviteRole === 'RECEPTIONIST' ? 'sm:col-span-2' : ''}>
                <Select
                  label="Role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  disabled={loading}
                  options={[
                    { value: 'DOCTOR', label: 'Doctor / Consultant' },
                    { value: 'RECEPTIONIST', label: 'Receptionist (Front Desk)' },
                  ]}
                />
              </div>

              {inviteRole === 'DOCTOR' && (
                <Select
                  label="Department *"
                  value={inviteDept}
                  onChange={(e) => setInviteDept(e.target.value)}
                  disabled={loading}
                  required
                  options={[
                    { value: 'General Medicine', label: 'General Medicine' },
                    { value: 'Pediatrics', label: 'Pediatrics' },
                    { value: 'Orthopedics', label: 'Orthopedics' },
                  ]}
                />
              )}

              <div className="sm:col-span-2 pt-1">
                <Button variant="primary" size="md" type="submit" className="w-full" disabled={loading}>
                  <Mail className="w-4 h-4 mr-2" />
                  {loading ? 'Dispatching Invitation Email...' : 'Send Invitation Email'}
                </Button>
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                  An activation email will be sent directly to their Gmail inbox. The staff member will set their own password.
                </p>
              </div>
            </form>
          </div>

          {/* Current Staff Roster */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-2">Staff Roster ({hiredStaff.length})</h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              {hiredStaff.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">No staff members found.</div>
              ) : (
                hiredStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/50"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-900 text-sm">{staff.name}</span>
                        <Badge
                          variant={staff.status === 'ACTIVE' ? 'success' : staff.status === 'INVITED' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {staff.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {staff.role} • {staff.email}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {staff.status === 'INVITED' && (
                        <Button variant="outline" size="sm" onClick={() => handleResend(staff.id, staff.email)}>
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Resend Email
                        </Button>
                      )}
                      <Button
                        variant={staff.status === 'ACTIVE' ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => handleToggleStatus(staff.id, staff.status)}
                      >
                        {staff.status === 'ACTIVE' ? (
                          <>
                            <Ban className="w-3 h-3 mr-1 text-rose-500" />
                            Deactivate
                          </>
                        ) : (
                          'Reactivate'
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

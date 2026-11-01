import React, { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Building2, Users, Calendar, ShieldCheck, Settings, FileText, UserPlus, Mail, CheckCircle2, RotateCcw, Ban } from 'lucide-react';

export function OwnerDashboard() {
  const { t } = useTranslation();
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState('');

  // Staff Management State
  const [staffList, setStaffList] = useState([
    { id: 'st_1', name: 'Dr. Sharma', email: 'dr.sharma@aarogyam.clinic', role: 'Doctor', dept: 'General Medicine', status: 'ACTIVE' },
    { id: 'st_2', name: 'Dr. Ananya Rao', email: 'dr.rao@aarogyam.clinic', role: 'Doctor', dept: 'Pediatrics', status: 'ACTIVE' },
    { id: 'st_3', name: 'Dr. V. Reddy', email: 'dr.reddy@aarogyam.clinic', role: 'Doctor', dept: 'Orthopedics', status: 'ACTIVE' },
    { id: 'st_4', name: 'Priya Verma', email: 'reception@aarogyam.clinic', role: 'Receptionist', dept: 'Front Desk', status: 'ACTIVE' },
  ]);

  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Doctor');
  const [inviteDept, setInviteDept] = useState('General Medicine');

  const handleSendInvite = (e) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;

    const newStaff = {
      id: `st_${Date.now()}`,
      name: inviteName,
      email: inviteEmail,
      role: inviteRole,
      dept: inviteDept,
      status: 'INVITED',
    };

    setStaffList((prev) => [...prev, newStaff]);
    setInviteSuccessMsg(`Invitation dispatched to ${inviteEmail}. Activation link generated.`);
    setInviteName('');
    setInviteEmail('');
    setTimeout(() => setInviteSuccessMsg(''), 6000);
  };

  const handleToggleStatus = (id) => {
    setStaffList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: s.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE' } : s))
    );
  };

  const handleResend = (email) => {
    setInviteSuccessMsg(`Fresh invitation token generated and resent to ${email}.`);
    setTimeout(() => setInviteSuccessMsg(''), 5000);
  };

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
              <Button variant="outline" size="sm" onClick={() => setIsStaffModalOpen(true)}>
                Manage Staff
              </Button>
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
                <p>₹120 (Applicable to confirmed remote appointments only). Walk-ins pay ₹0 advance.</p>
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

      {/* Staff Management Modal */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        title="Centralized Clinic Staff Management"
        size="lg"
      >
        <div className="space-y-6">
          {inviteSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{inviteSuccessMsg}</span>
            </div>
          )}

          {/* Invite New Staff Form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center space-x-1.5">
              <UserPlus className="w-4 h-4 text-teal-600" />
              <span>Invite New Staff Member</span>
            </h4>

            <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name"
                placeholder="e.g. Dr. Ramesh Kumar"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />

              <Input
                label="Email Address"
                type="email"
                placeholder="e.g. ramesh@aarogyam.clinic"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />

              <Select
                label="Role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                options={[
                  { value: 'Doctor', label: 'Doctor / Consultant' },
                  { value: 'Receptionist', label: 'Receptionist' },
                ]}
              />

              <Select
                label="Department"
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value)}
                options={[
                  { value: 'General Medicine', label: 'General Medicine' },
                  { value: 'Pediatrics', label: 'Pediatrics' },
                  { value: 'Orthopedics', label: 'Orthopedics' },
                  { value: 'Front Desk', label: 'Front Desk' },
                ]}
              />

              <div className="sm:col-span-2 pt-1">
                <Button variant="primary" size="md" type="submit" className="w-full">
                  <Mail className="w-4 h-4 mr-2" />
                  Send Invitation Token
                </Button>
                <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                  Staff member will receive a secure, single-use link to set their own password.
                </p>
              </div>
            </form>
          </div>

          {/* Current Staff Roster */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-2">Active & Invited Staff ({staffList.length})</h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {staffList.map((staff) => (
                <div key={staff.id} className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/50">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-900 text-sm">{staff.name}</span>
                      <Badge variant={staff.status === 'ACTIVE' ? 'success' : staff.status === 'INVITED' ? 'warning' : 'default'} size="sm">
                        {staff.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {staff.role} • {staff.dept} • {staff.email}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {staff.status === 'INVITED' && (
                      <Button variant="outline" size="sm" onClick={() => handleResend(staff.email)}>
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Resend
                      </Button>
                    )}
                    <Button
                      variant={staff.status === 'ACTIVE' ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={() => handleToggleStatus(staff.id)}
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
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

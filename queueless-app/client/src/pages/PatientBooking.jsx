import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { usePatientAuth } from '../context/PatientAuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Phone,
  User,
  Calendar,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export function PatientBooking() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { patientSession, isAuthenticated, requestOtp, verifyOtp, logout } = usePatientAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1: OTP Auth State
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Step 2: Patient & Target State
  const [bookingFor, setBookingFor] = useState('self'); // 'self' | 'family'
  const [selectedPatientId, setSelectedPatientId] = useState('NEW');
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('male');
  const [relationship, setRelationship] = useState('OTHER');
  const [reason, setReason] = useState('');

  // Step 3: Scheduling Preference State
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [preferredDate, setPreferredDate] = useState(tomorrowStr);
  const [timeWindow, setTimeWindow] = useState('morning'); // 'morning' | 'evening'

  // Submission Result State
  const [submittedAppointment, setSubmittedAppointment] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [existingAppointments, setExistingAppointments] = useState([]);

  const maskPhone = (num) => {
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    if (digits.length < 10) return num;
    const last4 = digits.slice(-4);
    const first2 = digits.slice(-10, -8);
    return `+91 ${first2}****${last4}`;
  };

  // If patient already has a verified session, pre-populate and advance
  useEffect(() => {
    if (isAuthenticated && patientSession?.contact?.phone) {
      setPhone(patientSession.contact.phone);
    }
  }, [isAuthenticated, patientSession]);

  // Fetch active appointments for verified booking contact
  useEffect(() => {
    if (isAuthenticated) {
      fetch('/api/v1/appointments/my-appointments', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data)) {
            setExistingAppointments(data.data);
          }
        })
        .catch(() => {});
    } else {
      setExistingAppointments([]);
    }
  }, [isAuthenticated]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // When selecting an existing linked family member
  const handleExistingPatientSelect = (patientId) => {
    setSelectedPatientId(patientId);
    if (patientId === 'NEW') {
      setPatientName('');
      setAge('');
      setGender('male');
    } else {
      const found = patientSession?.linkedPatients?.find((p) => p.id === patientId || p._id === patientId);
      if (found) {
        setPatientName(found.fullName || '');
        setAge(found.age ? String(found.age) : '');
        setGender(found.gender ? found.gender.toLowerCase() : 'male');
      }
    }
  };

  // STEP 1 HANDLERS: OTP
  const handleSendOtp = async () => {
    setErrorMsg('');
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const data = await requestOtp(cleanPhone);
      setOtpSent(true);
      setCooldown(data.cooldownSecs || 60);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to dispatch OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!otp.trim()) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      setStep(2);
    } catch (err) {
      setErrorMsg(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 & 3 VALIDATION
  
  const handlePayDeposit = async (appointmentId) => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/v1/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate checkout.');
      }

      const orderData = data.data;
      if (!window.Razorpay) {
        throw new Error('Razorpay SDK failed to load. Please check your internet connection.');
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Aarogyam Community Clinic',
        description: 'Appointment Commitment Deposit',
        order_id: orderData.orderId,
        handler: async function (response) {
          const verifyRes = await fetch('/api/v1/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            alert('Deposit Payment Successful! Your appointment is now Confirmed.');
            const myRes = await fetch('/api/v1/appointments/my-appointments', { credentials: 'include' });
            const myData = await myRes.json();
            if (myData.success) {
              setExistingAppointments(myData.data);
            }
          } else {
            setErrorMsg(verifyData.error || 'Payment verification failed.');
          }
        },
        prefill: {
          contact: phone,
          name: patientName,
        },
        theme: {
          color: '#0d9488',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setErrorMsg(`Payment failed: ${resp.error.description}`);
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(err.message || 'Payment initiation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Next = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!patientName.trim()) {
      setErrorMsg('Please enter the patient full name.');
      return;
    }
    if (!age || Number(age) <= 0 || Number(age) > 125) {
      setErrorMsg('Please enter a valid age between 1 and 125.');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Please describe the visit reason so reception can allocate the proper department.');
      return;
    }
    setStep(3);
  };

  // FINAL SUBMISSION
  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const isSelf = bookingFor === 'self';
      const isExistingFamily = !isSelf && selectedPatientId !== 'NEW';

      const payload = {
        patientTarget: isSelf ? 'SELF' : isExistingFamily ? 'EXISTING_FAMILY' : 'NEW_FAMILY',
        patientId: isExistingFamily ? selectedPatientId : null,
        newPatientData: {
          fullName: patientName.trim(),
          age: Number(age),
          gender: gender.toUpperCase(),
          relationship: isSelf ? 'SELF' : relationship,
        },
        requestedWindow: {
          preferredDate,
          preferredTimeSlot: timeWindow,
          reasonCategory: 'General Consultation',
          notes: reason.trim(),
        },
      };

      const res = await fetch('/api/v1/appointments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit appointment request.');
      }

      setSubmittedAppointment(data.data);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit appointment request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card className="shadow-lg border-slate-200">
        {!submittedAppointment ? (
          <div>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">
                  {t('patientBooking.title')}
                </h2>
                <Badge variant="primary" size="sm">
                  {t('patientBooking.step1')} - {step}/3
                </Badge>
              </div>

              {/* Mandatory Product Disclaimer */}
              <Alert variant="warning" className="mt-3">
                {t('patientBooking.disclaimer')}
              </Alert>
            </div>

            {errorMsg && (
              <Alert variant="danger" className="mb-6">
                {errorMsg}
              </Alert>
            )}

            {/* Stepper Progress */}
            <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
              <div className={`text-xs sm:text-sm font-semibold flex items-center space-x-1.5 ${step >= 1 ? 'text-teal-600' : 'text-slate-400'}`}>
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs">1</span>
                <span>Verification</span>
              </div>
              <div className="w-6 sm:w-10 h-px bg-slate-200" />
              <div className={`text-xs sm:text-sm font-semibold flex items-center space-x-1.5 ${step >= 2 ? 'text-teal-600' : 'text-slate-400'}`}>
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs">2</span>
                <span>Patient & Reason</span>
              </div>
              <div className="w-6 sm:w-10 h-px bg-slate-200" />
              <div className={`text-xs sm:text-sm font-semibold flex items-center space-x-1.5 ${step >= 3 ? 'text-teal-600' : 'text-slate-400'}`}>
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs">3</span>
                <span>Date & Window</span>
              </div>
            </div>

            {/* STEP 1: OTP AUTH */}
            {step === 1 && (
              <div className="space-y-6">
                {isAuthenticated ? (
                  <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-teal-900 font-semibold text-sm">
                        <ShieldCheck className="w-5 h-5 text-teal-600" />
                        <span>Active Session: {maskPhone(patientSession?.contact?.phone || phone)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await logout();
                          setOtpSent(false);
                          setOtp('');
                          setPhone('');
                        }}
                        className="text-xs text-rose-600 hover:text-rose-800 font-semibold underline cursor-pointer"
                      >
                        Sign Out / Not You?
                      </button>
                    </div>
                    <p className="text-xs text-teal-800">
                      Your mobile number is securely authenticated on this browser. You do not need to request an OTP again unless you sign out.
                    </p>
                    <div className="flex items-center space-x-3 pt-1">
                      <Button variant="primary" size="md" onClick={() => setStep(2)}>
                        <span>Continue Booking</span>
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          await logout();
                          setOtpSent(false);
                          setOtp('');
                          setPhone('');
                        }}
                      >
                        Clear Session
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div>
                      <Input
                        label={t('patientBooking.contactPhone')}
                        type="tel"
                        name="phone"
                        required
                        placeholder="10-digit Indian Mobile (+91)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={otpSent}
                        helperText="Used for SMS appointment notifications, slot offers, and check-in updates."
                      />
                    </div>

                    {!otpSent ? (
                      <Button
                        variant="primary"
                        type="button"
                        onClick={handleSendOtp}
                        disabled={loading || !phone.trim()}
                        className="w-full"
                      >
                        {loading ? 'Sending OTP...' : 'Send 6-Digit OTP'}
                      </Button>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                        <div className="flex justify-between items-center text-xs text-slate-600">
                          <span>Enter 6-Digit OTP sent to {phone}</span>
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={cooldown > 0 || loading}
                            className={`font-semibold ${
                              cooldown > 0
                                ? 'text-slate-400 cursor-not-allowed'
                                : 'text-teal-600 hover:underline cursor-pointer'
                            }`}
                          >
                            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                          </button>
                        </div>

                        <Input
                          name="otp"
                          required
                          placeholder="e.g. 123456"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          maxLength={6}
                          autoFocus
                        />



                        <div className="flex items-center space-x-3 pt-2">
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              setOtpSent(false);
                              setOtp('');
                            }}
                          >
                            Edit Phone
                          </Button>
                          <Button variant="primary" type="submit" disabled={loading} className="flex-1">
                            {loading ? 'Verifying OTP...' : 'Verify OTP & Continue'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* STEP 2: PATIENT & VISIT DETAILS */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Active / Confirmed Appointments Banner */}
                {existingAppointments.filter((a) => ['CONFIRMED', 'PENDING_REVIEW', 'SLOT_HELD'].includes(a.status)).length > 0 && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                          Your Existing Bookings
                        </span>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>

                    {existingAppointments
                      .filter((a) => ['CONFIRMED', 'PENDING_REVIEW', 'SLOT_HELD'].includes(a.status))
                      .map((appt) => (
                        <div
                          key={appt._id}
                          className="bg-white rounded-lg p-3.5 border border-emerald-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-base text-teal-900">{appt.bookingReference}</span>
                              <span className="text-sm font-semibold text-slate-800">• {appt.patientId?.fullName}</span>
                              <Badge variant={appt.status === 'CONFIRMED' ? 'success' : 'warning'} size="sm">
                                {appt.status}
                              </Badge>
                            </div>
                            <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                              <div>
                                <strong>Confirmed Slot:</strong>{' '}
                                <span className="font-semibold text-emerald-900">
                                  {appt.allocatedSlot?.date || appt.requestedWindow?.preferredDate} (
                                  {appt.allocatedSlot?.startTime
                                    ? `${appt.allocatedSlot.startTime} – ${appt.allocatedSlot.endTime}`
                                    : appt.requestedWindow?.preferredTimeSlot}
                                  )
                                </span>
                                {appt.assignedDoctorId && ` • Dr. Suresh (Room 101)`}
                              </div>
                              <div><strong>Complaint:</strong> {appt.requestedWindow?.notes || 'General Consultation'}</div>
                            </div>
                          </div>

                          
                          <div className="flex items-center space-x-2">
                            {appt.status === 'SLOT_HELD' && (
                              <Button
                                variant="primary"
                                size="sm"
                                type="button"
                                onClick={() => handlePayDeposit(appt._id)}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                Pay ₹100 Deposit
                              </Button>
                            )}
                            {appt.status === 'CONFIRMED' && (
                              <Button
                                variant="primary"
                                size="sm"
                                type="button"
                                onClick={() => navigate(`/check-in?ref=${appt.bookingReference}`)}
                              >
                                Check In Now
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => navigate('/queue')}
                            >
                              Live Queue
                            </Button>
                          </div>
                        </div>
                      ))}

                    <div className="text-xs text-emerald-800 font-medium pt-1">
                      Need to request another visit or book for another family member? Continue filling out the form below:
                    </div>
                  </div>
                )}

                <form onSubmit={handleStep2Next} className="space-y-5">
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingFor('self');
                      setRelationship('SELF');
                    }}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                      bookingFor === 'self'
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Booking For Myself
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingFor('family');
                      setRelationship('OTHER');
                    }}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                      bookingFor === 'family'
                        ? 'bg-white text-teal-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Booking For Family Member
                  </button>
                </div>

                {/* If Family Member: check existing linked dependents */}
                {bookingFor === 'family' && (
                  <div className="space-y-4 p-4 bg-teal-50/50 border border-teal-200 rounded-xl">
                    <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                      Family Relationship
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label="Relationship to Contact *"
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        options={[
                          { value: 'SPOUSE', label: 'Spouse' },
                          { value: 'CHILD', label: 'Child / Dependent' },
                          { value: 'PARENT', label: 'Parent' },
                          { value: 'OTHER', label: 'Other Relative' },
                        ]}
                      />

                      {patientSession?.linkedPatients?.length > 0 && (
                        <Select
                          label="Saved Household Profiles"
                          value={selectedPatientId}
                          onChange={(e) => handleExistingPatientSelect(e.target.value)}
                          options={[
                            { value: 'NEW', label: '+ Enter New Person Details' },
                            ...patientSession.linkedPatients.map((p) => ({
                              value: p.id || p._id,
                              label: `${p.fullName} (${p.gender}, Age ${p.age || '—'})`,
                            })),
                          ]}
                        />
                      )}
                    </div>
                  </div>
                )}

                <Input
                  label={t('patientBooking.patientName')}
                  name="patientName"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t('patientBooking.patientAge')}
                    type="number"
                    name="age"
                    required
                    placeholder="e.g. 34"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    min={1}
                    max={125}
                  />

                  <Select
                    label={t('patientBooking.patientGender')}
                    name="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    options={[
                      { value: 'male', label: t('patientBooking.genderMale') },
                      { value: 'female', label: t('patientBooking.genderFemale') },
                      { value: 'other', label: t('patientBooking.genderOther') },
                    ]}
                  />
                </div>

                <div>
                  <Input
                    label={t('patientBooking.visitReason')}
                    name="reason"
                    required
                    placeholder="e.g. Fever, cough for 2 days, knee pain follow-up"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    helperText="Our front desk reception will review this complaint to route you to the appropriate medical department and practitioner."
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    <span>Back</span>
                  </Button>
                  <Button variant="primary" type="submit">
                    <span>Continue to Date & Window</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </form>
              </div>
            )}

            {/* STEP 3: PREFERRED DATE & WINDOW */}
            {step === 3 && (
              <form onSubmit={handleSubmitBooking} className="space-y-6">
                <div className="space-y-4">
                  <Input
                    label={t('patientBooking.preferredDate')}
                    type="date"
                    required
                    min={tomorrowStr}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    helperText="Clinic operates Monday to Friday. Reception allocates slots within your chosen window."
                  />

                  <Select
                    label={t('patientBooking.timeWindow')}
                    value={timeWindow}
                    onChange={(e) => setTimeWindow(e.target.value)}
                    options={[
                      { value: 'morning', label: 'Morning Window (09:00 AM – 01:00 PM)' },
                      { value: 'evening', label: 'Evening Window (04:00 PM – 08:00 PM)' },
                    ]}
                  />

                  {/* Summary Overview */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900 block mb-1 text-sm">
                      Appointment Request Summary
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <p><strong>Patient:</strong> {patientName} ({gender}, {age} yrs)</p>
                      <p><strong>Contact:</strong> {phone}</p>
                      <p><strong>Target:</strong> {bookingFor === 'self' ? 'Self' : `Family (${relationship})`}</p>
                      <p><strong>Window:</strong> {timeWindow === 'morning' ? 'Morning (9 AM - 1 PM)' : 'Evening (4 PM - 8 PM)'}</p>
                    </div>
                    <p className="pt-1 text-slate-600 border-t border-slate-200 mt-2">
                      <strong>Visit Reason:</strong> {reason}
                    </p>
                    <p className="text-[11px] text-teal-800 bg-teal-50 p-2 rounded mt-2">
                      Notice: Scheduled appointments require clinic approval before payment. Walk-in patients pay ₹0 advance deposit under standard clinic policy.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button variant="secondary" onClick={() => setStep(2)} disabled={loading}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    <span>Back</span>
                  </Button>
                  <Button variant="primary" type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <span>{t('patientBooking.submitRequest')}</span>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* REAL PERSISTENT CONFIRMATION SCREEN */
          <div className="text-center py-6 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-slate-900">
                {t('patientBooking.requestSubmitted')}
              </h3>
              <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
                Your appointment request is saved in the clinic system. Our front desk receptionist will review your visit complaint and allocate a confirmed practitioner slot.
              </p>
            </div>

            {/* Public Booking Reference Badge */}
            <div className="p-6 bg-teal-50 border-2 border-teal-300 rounded-2xl max-w-sm mx-auto shadow-xs">
              <span className="text-xs uppercase tracking-wider font-semibold text-teal-800">
                {t('patientBooking.referenceCode')}
              </span>
              <div className="text-4xl font-black text-teal-900 tracking-widest mt-1 font-mono">
                {submittedAppointment.bookingReference}
              </div>
              <div className="mt-3 pt-2 border-t border-teal-200 text-xs text-teal-800 space-y-1">
                <p><strong>Status:</strong> <span className="font-semibold uppercase">{submittedAppointment.status}</span></p>
                <p><strong>Requested Date:</strong> {submittedAppointment.requestedWindow?.preferredDate || preferredDate}</p>
                <p><strong>Time Window:</strong> {submittedAppointment.requestedWindow?.preferredTimeSlot || timeWindow}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => navigate(`/queue?ref=${submittedAppointment.bookingReference}`)}
              >
                <span>Track Request on Live Queue</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmittedAppointment(null);
                  setStep(1);
                  setReason('');
                }}
              >
                Book Another Consultation
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

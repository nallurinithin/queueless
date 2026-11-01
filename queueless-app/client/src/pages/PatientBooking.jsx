import React, { useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { CheckCircle2, ShieldAlert, ArrowLeft, ArrowRight } from 'lucide-react';

export function PatientBooking() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [referenceCode, setReferenceCode] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    timeWindow: 'morning',
    department: 'generalMedicine',
    patientName: '',
    age: '',
    gender: 'male',
    bookingFor: 'self',
    phone: '',
    reason: '',
    otp: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (step < 3) {
      setStep((prev) => prev + 1);
    } else {
      // Simulate submission
      const mockRef = `QL-${Math.floor(100000 + Math.random() * 900000)}`;
      setReferenceCode(mockRef);
      setSubmitted(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card className="shadow-lg border-slate-200">
        {!submitted ? (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                {t('patientBooking.title')}
              </h2>
              {/* Mandatory Product Disclaimer */}
              <Alert variant="warning" className="mt-3">
                {t('patientBooking.disclaimer')}
              </Alert>
            </div>

            {/* Stepper Progress */}
            <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
              <div className={`text-xs sm:text-sm font-semibold ${step >= 1 ? 'text-teal-600' : 'text-slate-400'}`}>
                {t('patientBooking.step1')}
              </div>
              <div className="w-8 h-px bg-slate-200" />
              <div className={`text-xs sm:text-sm font-semibold ${step >= 2 ? 'text-teal-600' : 'text-slate-400'}`}>
                {t('patientBooking.step2')}
              </div>
              <div className="w-8 h-px bg-slate-200" />
              <div className={`text-xs sm:text-sm font-semibold ${step >= 3 ? 'text-teal-600' : 'text-slate-400'}`}>
                {t('patientBooking.step3')}
              </div>
            </div>

            <form onSubmit={handleNext} className="space-y-6">
              {/* STEP 1: PREFERRED WINDOW */}
              {step === 1 && (
                <div className="space-y-4">
                  <Input
                    label={t('patientBooking.preferredDate')}
                    type="date"
                    name="date"
                    required
                    value={formData.date}
                    onChange={handleChange}
                  />

                  <Select
                    label={t('patientBooking.timeWindow')}
                    name="timeWindow"
                    required
                    value={formData.timeWindow}
                    onChange={handleChange}
                    options={[
                      { value: 'morning', label: t('patientBooking.morning') },
                      { value: 'evening', label: t('patientBooking.evening') },
                    ]}
                  />

                  <Select
                    label={t('patientBooking.department')}
                    name="department"
                    required
                    value={formData.department}
                    onChange={handleChange}
                    options={[
                      { value: 'generalMedicine', label: t('patientBooking.generalMedicine') },
                      { value: 'pediatrics', label: t('patientBooking.pediatrics') },
                      { value: 'orthopedics', label: t('patientBooking.orthopedics') },
                      { value: 'dermatology', label: t('patientBooking.dermatology') },
                    ]}
                  />
                </div>
              )}

              {/* STEP 2: PATIENT DETAILS */}
              {step === 2 && (
                <div className="space-y-4">
                  <Select
                    label={t('patientBooking.bookingFor')}
                    name="bookingFor"
                    value={formData.bookingFor}
                    onChange={handleChange}
                    options={[
                      { value: 'self', label: t('patientBooking.bookingForSelf') },
                      { value: 'other', label: t('patientBooking.bookingForOther') },
                    ]}
                  />

                  <Input
                    label={t('patientBooking.patientName')}
                    name="patientName"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={formData.patientName}
                    onChange={handleChange}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label={t('patientBooking.patientAge')}
                      type="number"
                      name="age"
                      required
                      placeholder="e.g. 34"
                      value={formData.age}
                      onChange={handleChange}
                    />

                    <Select
                      label={t('patientBooking.patientGender')}
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      options={[
                        { value: 'male', label: t('patientBooking.genderMale') },
                        { value: 'female', label: t('patientBooking.genderFemale') },
                        { value: 'other', label: t('patientBooking.genderOther') },
                      ]}
                    />
                  </div>

                  <Input
                    label={t('patientBooking.visitReason')}
                    name="reason"
                    placeholder="e.g. Fever, routine follow-up"
                    value={formData.reason}
                    onChange={handleChange}
                  />
                </div>
              )}

              {/* STEP 3: OTP VERIFICATION */}
              {step === 3 && (
                <div className="space-y-4">
                  <Input
                    label={t('patientBooking.contactPhone')}
                    type="tel"
                    name="phone"
                    required
                    placeholder="10-digit Indian Mobile (+91)"
                    value={formData.phone}
                    onChange={handleChange}
                    helperText="We will send appointment updates and slot offers via SMS."
                  />

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-600">
                      <span>One-Time Password (OTP)</span>
                      <span className="text-teal-600 font-medium cursor-pointer hover:underline">
                        Send OTP
                      </span>
                    </div>
                    <Input
                      name="otp"
                      placeholder="Enter 6-digit OTP (e.g. 123456)"
                      value={formData.otp}
                      onChange={handleChange}
                    />
                    <p className="text-[11px] text-slate-500">
                      For development preview, enter any 6 digits to verify.
                    </p>
                  </div>
                </div>
              )}

              {/* Form Navigation Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {step > 1 ? (
                  <Button
                    variant="secondary"
                    onClick={() => setStep((prev) => prev - 1)}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    {t('common.back')}
                  </Button>
                ) : <div />}

                <Button variant="primary" type="submit">
                  {step < 3 ? (
                    <>
                      <span>{t('common.next')}</span>
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </>
                  ) : (
                    <span>{t('patientBooking.submitRequest')}</span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="text-center py-6 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-slate-900">
                {t('patientBooking.requestSubmitted')}
              </h3>
              <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
                {t('patientBooking.nextSteps')}
              </p>
            </div>

            <div className="p-6 bg-teal-50 border border-teal-200 rounded-2xl max-w-sm mx-auto">
              <span className="text-xs uppercase tracking-wider font-semibold text-teal-800">
                {t('patientBooking.referenceCode')}
              </span>
              <div className="text-3xl font-extrabold text-teal-900 tracking-wider mt-1">
                {referenceCode}
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                setSubmitted(false);
                setStep(1);
              }}
            >
              Submit Another Request
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}


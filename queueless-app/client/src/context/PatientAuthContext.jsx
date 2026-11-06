import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const PatientAuthContext = createContext(null);

export function PatientAuthProvider({ children }) {
  const [patientSession, setPatientSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from HttpOnly cookie on page load / refresh
  const restoreSession = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/patient/auth/session', {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.authenticated && data.data) {
        setPatientSession({
          authenticated: true,
          contact: data.data.contact,
          linkedPatients: data.data.linkedPatients || [],
        });
      } else {
        setPatientSession(null);
      }
    } catch {
      setPatientSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const requestOtp = async (phone) => {
    const res = await fetch('/api/v1/patient/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to request OTP.');
    }
    return data;
  };

  const verifyOtp = async (phone, otp) => {
    const res = await fetch('/api/v1/patient/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid or expired OTP.');
    }

    const sessionData = {
      authenticated: true,
      contact: data.data.contact,
      linkedPatients: data.data.linkedPatients || [],
    };
    setPatientSession(sessionData);
    return sessionData;
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/patient/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    setPatientSession(null);
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patientSession,
        isAuthenticated: !!patientSession?.authenticated,
        loading,
        requestOtp,
        verifyOtp,
        logout,
        restoreSession,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth() {
  const context = useContext(PatientAuthContext);
  if (!context) {
    throw new Error('usePatientAuth must be used within a PatientAuthProvider');
  }
  return context;
}


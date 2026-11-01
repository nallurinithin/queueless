import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const ROLES = {
  OWNER: 'owner',
  RECEPTIONIST: 'receptionist',
  DOCTOR: 'doctor',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('queueless_staff_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const login = (emailOrRole, password = '') => {
    let resolvedRole = ROLES.RECEPTIONIST;
    let staffName = 'Priya (Receptionist)';
    const identifier = (typeof emailOrRole === 'string' ? emailOrRole : '').toLowerCase();

    if (identifier.includes('admin') || identifier.includes('owner') || identifier.includes('patel')) {
      resolvedRole = ROLES.OWNER;
      staffName = 'Dr. Patel (Clinic Owner)';
    } else if (identifier.includes('doc') || identifier.includes('sharma') || identifier.includes('practitioner')) {
      resolvedRole = ROLES.DOCTOR;
      staffName = 'Dr. Sharma (Doctor)';
    } else {
      resolvedRole = ROLES.RECEPTIONIST;
      staffName = 'Priya (Receptionist)';
    }

    const authData = {
      id: `staff_${Date.now()}`,
      name: staffName,
      email: identifier.includes('@') ? identifier : `${resolvedRole}@aarogyam.clinic`,
      role: resolvedRole,
      clinicId: 'clinic_aarogyam_01',
      token: `mock_session_${Date.now()}`,
      loginAt: new Date().toISOString(),
    };
    setUser(authData);
    localStorage.setItem('queueless_staff_user', JSON.stringify(authData));
    return authData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('queueless_staff_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, ROLES }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


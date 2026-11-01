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

  const login = (role, staffDetails = {}) => {
    const authData = {
      id: staffDetails.id || `staff_${Date.now()}`,
      name: staffDetails.name || (role === ROLES.DOCTOR ? 'Dr. Sharma' : role === ROLES.OWNER ? 'Dr. Patel (Admin)' : 'Priya (Reception)'),
      role,
      clinicId: 'clinic_aarogyam_01',
      token: `mock_session_${Date.now()}`,
      loginAt: new Date().toISOString(),
    };
    setUser(authData);
    localStorage.setItem('queueless_staff_user', JSON.stringify(authData));
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

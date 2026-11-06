import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const ROLES = {
  OWNER: 'CLINIC_OWNER',
  RECEPTIONIST: 'RECEPTIONIST',
  DOCTOR: 'DOCTOR',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Purge any stale legacy localStorage so browser restarts start clean
    try {
      localStorage.removeItem('queueless_staff_user');
    } catch {}

    const saved = sessionStorage.getItem('queueless_staff_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Verify backend session on startup
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch('/api/v1/staff/auth/me', {
          credentials: 'include',
        });
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const authData = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
            clinicId: data.user.clinicId,
          };
          setUser(authData);
          sessionStorage.setItem('queueless_staff_user', JSON.stringify(authData));
        } else {
          setUser(null);
          sessionStorage.removeItem('queueless_staff_user');
        }
      } catch {
        // If server is not responding, do not retain unverified session
      }
    };

    verifySession();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch('/api/v1/staff/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      const authData = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        clinicId: data.user.clinicId,
        redirectPath: data.redirectPath,
        loginAt: new Date().toISOString(),
      };

      setUser(authData);
      sessionStorage.setItem('queueless_staff_user', JSON.stringify(authData));
      return { success: true, ...authData };
    } catch (err) {
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/staff/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    sessionStorage.removeItem('queueless_staff_user');
    try {
      localStorage.removeItem('queueless_staff_user');
    } catch {}
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

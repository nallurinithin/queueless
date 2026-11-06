import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientAuthProvider } from './context/PatientAuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { PublicLanding } from './pages/PublicLanding';
import { PatientBooking } from './pages/PatientBooking';
import { PatientCheckIn } from './pages/PatientCheckIn';
import { PatientQueue } from './pages/PatientQueue';
import { WaitingRoomDisplay } from './pages/WaitingRoomDisplay';
import { StaffLogin } from './pages/StaffLogin';
import { StaffActivate } from './pages/StaffActivate';
import { ReceptionistDashboard } from './pages/dashboards/ReceptionistDashboard';
import { DoctorDashboard } from './pages/dashboards/DoctorDashboard';
import { OwnerDashboard } from './pages/dashboards/OwnerDashboard';
import { StaffLiveQueue } from './pages/StaffLiveQueue';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const defaultPath =
      user.role === 'DOCTOR'
        ? '/staff/doctor'
        : user.role === 'RECEPTIONIST'
        ? '/staff/receptionist'
        : '/staff/owner';
    return <Navigate to={defaultPath} replace />;
  }

  return children;
}

function AppLayout({ children }) {
  const location = useLocation();
  const isDisplayRoute = location.pathname === '/display';

  if (isDisplayRoute) {
    return <main>{children}</main>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <PatientAuthProvider>
          <BrowserRouter>
          <AppLayout>
            <Routes>
              {/* Public & Patient Routes */}
              <Route path="/" element={<PublicLanding />} />
              <Route path="/book" element={<PatientBooking />} />
              <Route path="/check-in" element={<PatientCheckIn />} />
              <Route path="/queue" element={<PatientQueue />} />
              <Route path="/display" element={<WaitingRoomDisplay />} />
              <Route path="/waiting-room" element={<WaitingRoomDisplay />} />

              {/* Staff Authentication */}
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route path="/staff/activate" element={<StaffActivate />} />

              {/* Staff Role Dashboards & Live Queue (Protected) */}
              <Route
                path="/staff/receptionist"
                element={
                  <ProtectedRoute allowedRoles={['RECEPTIONIST', 'CLINIC_OWNER']}>
                    <ReceptionistDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/doctor"
                element={
                  <ProtectedRoute allowedRoles={['DOCTOR', 'CLINIC_OWNER']}>
                    <DoctorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/owner"
                element={
                  <ProtectedRoute allowedRoles={['CLINIC_OWNER']}>
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/queue"
                element={
                  <ProtectedRoute allowedRoles={['DOCTOR', 'RECEPTIONIST', 'CLINIC_OWNER']}>
                    <StaffLiveQueue />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<PublicLanding />} />
            </Routes>
          </AppLayout>
          </BrowserRouter>
        </PatientAuthProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

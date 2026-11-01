import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { PublicLanding } from './pages/PublicLanding';
import { PatientBooking } from './pages/PatientBooking';
import { PatientCheckIn } from './pages/PatientCheckIn';
import { PatientQueue } from './pages/PatientQueue';
import { WaitingRoomDisplay } from './pages/WaitingRoomDisplay';
import { StaffLogin } from './pages/StaffLogin';
import { ReceptionistDashboard } from './pages/dashboards/ReceptionistDashboard';
import { DoctorDashboard } from './pages/dashboards/DoctorDashboard';
import { OwnerDashboard } from './pages/dashboards/OwnerDashboard';

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
        <BrowserRouter>
          <AppLayout>
            <Routes>
              {/* Public & Patient Routes */}
              <Route path="/" element={<PublicLanding />} />
              <Route path="/book" element={<PatientBooking />} />
              <Route path="/check-in" element={<PatientCheckIn />} />
              <Route path="/queue" element={<PatientQueue />} />
              <Route path="/display" element={<WaitingRoomDisplay />} />

              {/* Staff Authentication */}
              <Route path="/staff/login" element={<StaffLogin />} />

              {/* Staff Role Dashboards */}
              <Route path="/staff/receptionist" element={<ReceptionistDashboard />} />
              <Route path="/staff/doctor" element={<DoctorDashboard />} />
              <Route path="/staff/owner" element={<OwnerDashboard />} />

              {/* Fallback */}
              <Route path="*" element={<PublicLanding />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Clock, Calendar, CheckCircle2, UserCheck, Tv, LogOut, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth, ROLES } from '../../context/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
    navigate('/');
  };

  // Public visitor navigation links (default for patients & unauthenticated visitors)
  const publicLinks = [
    { to: '/', label: t('nav.home') },
    { to: '/book', label: t('nav.bookAppointment'), icon: Calendar },
    { to: '/queue', label: t('nav.liveQueue'), icon: Clock },
  ];

  // Role-specific staff navigation links (strictly for staff portal routes)
  const getStaffLinks = () => {
    if (!user) return publicLinks;
    switch (user.role) {
      case ROLES.RECEPTIONIST:
        return [
          { to: '/staff/receptionist', label: 'Reception Desk', icon: UserCheck },
          { to: '/staff/queue', label: t('nav.liveQueue'), icon: Clock },
        ];
      case ROLES.DOCTOR:
        return [
          { to: '/staff/doctor', label: 'Doctor Console', icon: UserCheck },
          { to: '/staff/queue', label: t('nav.liveQueue'), icon: Clock },
        ];
      case ROLES.OWNER:
        return [
          { to: '/staff/owner', label: 'Clinic Overview', icon: UserCheck },
          { to: '/staff/queue', label: t('nav.liveQueue'), icon: Clock },
        ];
      default:
        return publicLinks;
    }
  };

  const getDashboardLink = () => {
    if (!user) return '/staff/login';
    switch (user.role) {
      case ROLES.RECEPTIONIST:
        return '/staff/receptionist';
      case ROLES.DOCTOR:
        return '/staff/doctor';
      case ROLES.OWNER:
        return '/staff/owner';
      default:
        return '/staff/login';
    }
  };

  // The staff portal navbar is ONLY rendered when on staff portal routes (e.g. /staff/doctor, /staff/owner)
  const isStaffRoute =
    location.pathname.startsWith('/staff') &&
    location.pathname !== '/staff/login' &&
    location.pathname !== '/staff/activate';

  const isStaffPortalActive = isAuthenticated && isStaffRoute;

  // Active navigation links: public when on landing/booking, staff console when inside staff portal
  const navLinks = isStaffPortalActive ? getStaffLinks() : publicLinks;

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white font-extrabold text-xl shadow-xs">
                Q
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg text-slate-900 tracking-tight leading-none">
                  QueueLess
                </span>
                <span className="text-[11px] font-medium text-teal-700 leading-tight">
                  {t('common.clinicName')}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.to)
                    ? 'bg-teal-50 text-teal-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Actions & Language Selector */}
          <div className="hidden md:flex items-center space-x-3">
            <LanguageSelector />

            {isStaffPortalActive ? (
              // Staff Portal Header Controls
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <Link to={getDashboardLink()}>
                  <Badge variant="primary" size="lg" className="cursor-pointer hover:bg-teal-100">
                    <UserCheck className="w-3.5 h-3.5 mr-1" />
                    {user?.name}
                  </Badge>
                </Link>
                <button
                  onClick={handleLogout}
                  title={t('common.logout')}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : isAuthenticated ? (
              // Authenticated staff browsing public visitor pages: clean portal link + logout
              <div className="flex items-center space-x-2">
                <Link to={getDashboardLink()}>
                  <Button variant="primary" size="sm" className="flex items-center gap-1.5 cursor-pointer">
                    <span>{t('nav.staffPortal') || 'Staff Portal'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                <button
                  onClick={handleLogout}
                  title={t('common.logout')}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // Public visitor view: Staff Login button
              <Link to="/staff/login">
                <Button variant="secondary" size="sm">
                  {t('common.login')}
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex items-center space-x-2 md:hidden">
            <LanguageSelector />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-base font-medium ${
                isActive(item.to)
                  ? 'bg-teal-50 text-teal-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </Link>
          ))}

          <div className="pt-3 mt-3 border-t border-slate-100 flex flex-col space-y-2">
            {isStaffPortalActive ? (
              <>
                <Link
                  to={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm text-teal-700 font-medium"
                >
                  {t('nav.dashboard')} ({user?.name})
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleLogout}
                >
                  {t('common.logout')}
                </Button>
              </>
            ) : isAuthenticated ? (
              <>
                <Link
                  to={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button variant="primary" size="md" className="w-full">
                    {t('nav.staffPortal') || 'Staff Portal'}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                >
                  {t('common.logout')}
                </Button>
              </>
            ) : (
              <Link to="/staff/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="primary" size="md" className="w-full">
                  {t('common.login')}
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Clock, Calendar, CheckCircle2, UserCheck, Tv, LogOut } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth, ROLES } from '../../context/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();

  const publicLinks = [
    { to: '/', label: t('nav.home'), icon: null },
    { to: '/book', label: t('nav.bookAppointment'), icon: Calendar },
    { to: '/check-in', label: t('nav.checkIn'), icon: CheckCircle2 },
    { to: '/queue', label: t('nav.liveQueue'), icon: Clock },
    { to: '/display', label: t('nav.display'), icon: Tv },
  ];

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
            {publicLinks.map((item) => (
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

            {isAuthenticated ? (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <Link to={getDashboardLink()}>
                  <Badge variant="primary" size="lg" className="cursor-pointer hover:bg-teal-100">
                    <UserCheck className="w-3.5 h-3.5 mr-1" />
                    {user.name} ({t(`auth.role${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`)})
                  </Badge>
                </Link>
                <button
                  onClick={logout}
                  title={t('common.logout')}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
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
          {publicLinks.map((item) => (
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
            {isAuthenticated ? (
              <>
                <Link
                  to={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm text-teal-700 font-medium"
                >
                  {t('nav.dashboard')} ({user.name})
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
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

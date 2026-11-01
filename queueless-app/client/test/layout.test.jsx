import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';

describe('App Layout and Shell Routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders navbar brand and primary action cards on public landing', () => {
    render(<App />);

    // Brand and clinic name appear in multiple places
    const brandElements = screen.getAllByText('QueueLess');
    expect(brandElements.length).toBeGreaterThanOrEqual(1);

    const clinicElements = screen.getAllByText('Aarogyam Community Clinic');
    expect(clinicElements.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Care Without the Waiting Room Crowds')).toBeDefined();

    const requestElements = screen.getAllByText('Request Appointment');
    expect(requestElements.length).toBeGreaterThanOrEqual(1);

    const checkInElements = screen.getAllByText('Patient Check-In');
    expect(checkInElements.length).toBeGreaterThanOrEqual(1);

    const queueElements = screen.getAllByText('Track Live Queue');
    expect(queueElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders only guest navigation for unauthenticated visitors', () => {
    render(<App />);

    // Guest navigation links
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getAllByText('Book Appointment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Track Live Queue').length).toBeGreaterThanOrEqual(1);

    // Staff login action button present
    expect(screen.getAllByText('Staff Login').length).toBeGreaterThanOrEqual(1);

    // Role-specific staff links must NOT be visible to unauthenticated guests
    expect(screen.queryByText('Doctor Console')).toBeNull();
    expect(screen.queryByText('Reception Desk')).toBeNull();
    expect(screen.queryByText('Clinic Overview')).toBeNull();
  });

  it('provides a unified staff login without a role selector dropdown', () => {
    window.history.pushState({}, 'Login', '/staff/login');
    render(<App />);

    expect(screen.getByText('Staff Portal Login')).toBeDefined();

    // Verify there is NO role dropdown selector
    expect(screen.queryByLabelText(/Role/i)).toBeNull();

    // Verify email and password inputs exist
    expect(screen.getByPlaceholderText(/staff@aarogyam.clinic/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/••••••••••••/i)).toBeDefined();
  });
});

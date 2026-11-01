import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../src/context/LanguageContext';
import { ReceptionistDashboard } from '../src/pages/dashboards/ReceptionistDashboard';
import { WaitingRoomDisplay } from '../src/pages/WaitingRoomDisplay';

describe('Milestone 7: Assisted On-Site Desk Flows & Accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Receptionist dashboard provides Assisted Check-In and Walk-In Registration buttons', () => {
    render(
      <LanguageProvider>
        <ReceptionistDashboard />
      </LanguageProvider>
    );

    expect(screen.getByRole('button', { name: /assisted check-in/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /register walk-in patient/i })).toBeDefined();
  });

  it('2. Register Walk-In modal discloses ₹0 advance deposit policy and issues FIFO token', () => {
    render(
      <LanguageProvider>
        <ReceptionistDashboard />
      </LanguageProvider>
    );

    // Open Walk-In modal
    fireEvent.click(screen.getByRole('button', { name: /register walk-in patient/i }));

    // Check dialog role and policy notice
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Walk-in patients pay/i)).toBeDefined();
    expect(screen.getByText(/₹0 advance deposit/i)).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/Ramesh Kumar/i), {
      target: { value: 'Kavita Sundaram' },
    });
    fireEvent.change(screen.getByPlaceholderText(/35/i), {
      target: { value: '28' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /issue walk-in token/i }));

    // Check result
    expect(screen.getByText('Walk-In Token Issued')).toBeDefined();
    expect(screen.getAllByText('Kavita Sundaram').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₹0 (Walk-In Policy)')).toBeDefined();
    expect(screen.getByRole('button', { name: /print slip/i })).toBeDefined();
  });

  it('3. Assisted Check-In modal confirms desk arrival by booking reference', () => {
    render(
      <LanguageProvider>
        <ReceptionistDashboard />
      </LanguageProvider>
    );

    // Open Assisted Check-In modal
    fireEvent.click(screen.getByRole('button', { name: /assisted check-in/i }));
    expect(screen.getByRole('dialog')).toBeDefined();

    // Input reference
    fireEvent.change(screen.getByPlaceholderText(/QL-829104/i), {
      target: { value: 'QL-829104' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /check in patient/i }));

    expect(screen.getByText('Check-In Confirmed')).toBeDefined();
    expect(screen.getByText('QL-829104')).toBeDefined();
  });

  it('4. Waiting room display provides ARIA live region and voice audio toggle for accessibility', () => {
    render(
      <LanguageProvider>
        <WaitingRoomDisplay />
      </LanguageProvider>
    );

    // Screen reader announcement region exists
    const ariaLiveRegion = screen.getByTestId('aria-announcement');
    expect(ariaLiveRegion).toBeDefined();
    expect(ariaLiveRegion.getAttribute('role')).toBe('status');
    expect(ariaLiveRegion.getAttribute('aria-live')).toBe('assertive');

    // Voice audio toggle exists
    const voiceBtn = screen.getByRole('button', { name: /toggle voice audio announcements/i });
    expect(voiceBtn).toBeDefined();
    expect(voiceBtn.textContent).toContain('Voice Audio: OFF');

    // Toggle on
    fireEvent.click(voiceBtn);
    expect(voiceBtn.textContent).toContain('Voice Audio: ON');
  });
});

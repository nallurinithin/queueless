import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App Layout and Shell Routing', () => {
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
});

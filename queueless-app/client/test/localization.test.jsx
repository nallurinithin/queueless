import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider, useTranslation, SUPPORTED_LANGUAGES } from '../src/context/LanguageContext';

function TestComponent() {
  const { currentLang, changeLanguage, t } = useTranslation();
  return (
    <div>
      <span data-testid="current-lang">{currentLang}</span>
      <span data-testid="app-name">{t('common.appName')}</span>
      <span data-testid="tagline">{t('common.tagline')}</span>
      <span data-testid="fallback">{t('nonexistent.fakeKey')}</span>
      <button onClick={() => changeLanguage('hi')}>Switch to Hindi</button>
      <button onClick={() => changeLanguage('te')}>Switch to Telugu</button>
      <button onClick={() => changeLanguage('pa')}>Attempt Switch to Punjabi</button>
    </div>
  );
}

describe('Localization System (en, hi, te)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to English (en)', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId('current-lang').textContent).toBe('en');
    expect(screen.getByTestId('app-name').textContent).toBe('QueueLess');
  });

  it('switches to Hindi and translates strings', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Switch to Hindi'));
    expect(screen.getByTestId('current-lang').textContent).toBe('hi');
    expect(screen.getByTestId('tagline').textContent).toContain('स्मार्ट');
  });

  it('switches to Telugu and translates strings', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Switch to Telugu'));
    expect(screen.getByTestId('current-lang').textContent).toBe('te');
    expect(screen.getByTestId('tagline').textContent).toContain('స్మార్ట్');
  });

  it('strictly excludes Punjabi (pa) from supported languages', () => {
    const supportedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(supportedCodes).toContain('en');
    expect(supportedCodes).toContain('hi');
    expect(supportedCodes).toContain('te');
    expect(supportedCodes).not.toContain('pa');
    expect(supportedCodes.length).toBe(3);

    // Attempting to change to unsupported language should be rejected
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Attempt Switch to Punjabi'));
    expect(screen.getByTestId('current-lang').textContent).toBe('en');
  });

  it('falls back to key or English when key is missing', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId('fallback').textContent).toBe('nonexistent.fakeKey');
  });
});


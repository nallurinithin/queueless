import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import te from '../locales/te.json';

const translations = { en, hi, te };

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [currentLang, setCurrentLang] = useState(() => {
    const saved = localStorage.getItem('queueless_lang');
    if (saved && ['en', 'hi', 'te'].includes(saved)) {
      return saved;
    }
    return 'en';
  });

  const changeLanguage = (code) => {
    if (['en', 'hi', 'te'].includes(code)) {
      setCurrentLang(code);
      localStorage.setItem('queueless_lang', code);
    }
  };

  /**
   * Translates a dot-notated key with English fallback.
   * e.g., t('landing.title')
   */
  const t = useCallback((key) => {
    const keys = key.split('.');
    
    // Helper to resolve nested keys
    const resolve = (obj) => {
      let curr = obj;
      for (const k of keys) {
        if (!curr || typeof curr !== 'object') return null;
        curr = curr[k];
      }
      return curr;
    };

    // Try current language
    let result = resolve(translations[currentLang]);

    // Fallback to English if missing
    if (result === undefined || result === null) {
      result = resolve(translations.en);
      if (process.env.NODE_ENV !== 'production' && currentLang !== 'en') {
        console.warn(`[i18n] Missing translation for key "${key}" in language "${currentLang}". Falling back to English.`);
      }
    }

    return result || key;
  }, [currentLang]);

  return (
    <LanguageContext.Provider value={{ currentLang, changeLanguage, t, supportedLanguages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}


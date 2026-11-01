import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export function LanguageSelector({ className = '' }) {
  const { currentLang, changeLanguage, supportedLanguages } = useTranslation();

  return (
    <div className={`relative inline-flex items-center space-x-1.5 ${className}`}>
      <Globe className="w-4 h-4 text-slate-500" />
      <select
        value={currentLang}
        onChange={(e) => changeLanguage(e.target.value)}
        aria-label="Select application language"
        className="bg-transparent text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 border-none rounded py-1 pl-1 pr-6 focus:ring-1 focus:ring-teal-500 cursor-pointer"
      >
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native} ({lang.label})
          </option>
        ))}
      </select>
    </div>
  );
}

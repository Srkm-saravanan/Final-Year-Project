import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CortexPage, CurrencyType, DisplayScale, FiscalPeriod } from '../types/cortex';
import { loadUIPreferences, saveUIPreferences } from '../utils/storage';

export interface AppUIContextType {
  currentPage: CortexPage;
  setCurrentPage: (page: CortexPage) => void;
  currency: CurrencyType;
  setCurrency: (currency: CurrencyType) => void;
  fiscalPeriod: FiscalPeriod;
  setFiscalPeriod: (period: FiscalPeriod) => void;
  selectedDepartment: string;
  setSelectedDepartment: (department: string) => void;
  displayScale: DisplayScale;
  setDisplayScale: (scale: DisplayScale) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  formatCurrency: (valInCr: number) => string;
}

const AppUIContext = createContext<AppUIContextType | null>(null);

export const AppUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialPrefs = useMemo(() => loadUIPreferences(), []);

  const [currentPage, setCurrentPage] = useState<CortexPage>('overview');
  const [currency, setCurrencyState] = useState<CurrencyType>(initialPrefs.currency);
  const [fiscalPeriod, setFiscalPeriod] = useState<FiscalPeriod>('Q3 FY2026');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All Enterprise');
  const [displayScale, setDisplayScaleState] = useState<DisplayScale>(initialPrefs.displayScale);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  const setCurrency = useCallback((nextCurrency: CurrencyType) => {
    setCurrencyState(nextCurrency);
    setDisplayScaleState((currentScale) => {
      saveUIPreferences({ currency: nextCurrency, displayScale: currentScale });
      return currentScale;
    });
  }, []);

  const setDisplayScale = useCallback((nextScale: DisplayScale) => {
    setDisplayScaleState(nextScale);
    setCurrencyState((currentCurrency) => {
      saveUIPreferences({ currency: currentCurrency, displayScale: nextScale });
      return currentCurrency;
    });
  }, []);

  const formatCurrency = useCallback(
    (valInCr: number): string => {
      if (currency === 'USD') {
        const inUsdMillions = valInCr * 0.12;
        const absUsd = Math.abs(inUsdMillions);
        const sign = inUsdMillions <= -0.05 ? '-' : '';
        return `${sign}$ ${absUsd.toLocaleString('en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}M`;
      }
      const absInr = Math.abs(valInCr);
      const sign = valInCr <= -0.05 ? '-' : '';
      return `${sign}₹ ${absInr.toLocaleString('en-IN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} Cr`;
    },
    [currency]
  );

  // Global keyboard shortcut for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo<AppUIContextType>(
    () => ({
      currentPage,
      setCurrentPage,
      currency,
      setCurrency,
      fiscalPeriod,
      setFiscalPeriod,
      selectedDepartment,
      setSelectedDepartment,
      displayScale,
      setDisplayScale,
      isCommandPaletteOpen,
      setIsCommandPaletteOpen,
      isReportModalOpen,
      setIsReportModalOpen,
      formatCurrency,
    }),
    [
      currentPage,
      currency,
      setCurrency,
      fiscalPeriod,
      selectedDepartment,
      displayScale,
      setDisplayScale,
      isCommandPaletteOpen,
      isReportModalOpen,
      formatCurrency,
    ]
  );

  return <AppUIContext.Provider value={value}>{children}</AppUIContext.Provider>;
};

export const useAppUI = (): AppUIContextType => {
  const ctx = useContext(AppUIContext);
  if (!ctx) {
    throw new Error('useAppUI must be used within an AppUIProvider');
  }
  return ctx;
};

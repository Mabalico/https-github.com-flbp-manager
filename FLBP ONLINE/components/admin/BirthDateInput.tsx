import React from 'react';
import { CalendarDays } from 'lucide-react';
import { formatBirthDateDisplay, normalizeBirthDateInput } from '../../services/playerIdentity';

interface BirthDateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  calendarTitle?: string;
  disabled?: boolean;
}

const maskBirthDateInput = (raw: string) => {
  const cleaned = String(raw || '').replace(/[^\d/]/g, '');
  const digits = cleaned.replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join('/');
};

export const BirthDateInput: React.FC<BirthDateInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'gg/mm/aaaa',
  ariaLabel = 'Data di nascita',
  calendarTitle = 'Apri calendario',
  disabled = false,
}) => {
  const pickerRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(maskBirthDateInput(event.target.value))}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="bday"
        aria-label={ariaLabel}
        disabled={disabled}
        className={`${className} flex-1`}
      />
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          const input = pickerRef.current;
          if (!input) return;
          const normalized = normalizeBirthDateInput(value);
          if (normalized) input.value = normalized;
          const anyInput = input as HTMLInputElement & { showPicker?: () => void };
          if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
          else input.click();
        }}
        className={`shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
        aria-label={`${ariaLabel}: ${calendarTitle.toLowerCase()}`}
        disabled={disabled}
        title={calendarTitle}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        aria-hidden="true"
        onChange={(event) => onChange(formatBirthDateDisplay(event.target.value))}
      />
    </div>
  );
};

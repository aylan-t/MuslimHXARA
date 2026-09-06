import React, { useId, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface AccessibleComboboxProps {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
}

export function AccessibleCombobox({
  label,
  value,
  options,
  placeholder,
  required,
  disabled,
  onChange,
  onCommit,
}: AccessibleComboboxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const query = value.trim().toLocaleLowerCase('fr-CA');
    return options.filter(option => !query || option.toLocaleLowerCase('fr-CA').startsWith(query)).slice(0, 8);
  }, [options, value]);

  const choose = (option: string) => {
    onChange(option);
    onCommit?.(option);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-800">
        {label}{required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered.length ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={event => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(index => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex(index => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && filtered.length) {
              event.preventDefault();
              choose(filtered[activeIndex] ?? filtered[0]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 pr-11 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      </div>
      {open && !disabled && filtered.length > 0 && (
        <ul id={`${id}-options`} role="listbox" className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {filtered.map((option, index) => (
            <li
              key={option}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option === value}
              onMouseDown={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${index === activeIndex ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {option}
              {option === value && <Check className="h-4 w-4 text-emerald-600" />}
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && value && filtered.length === 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg">
          Aucun résultat. Votre saisie manuelle sera conservée.
        </div>
      )}
    </div>
  );
}
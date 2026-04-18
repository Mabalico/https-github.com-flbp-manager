import React from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../../../App';

export interface TeamPickerOption {
  id: string;
  name: string;
  disabled?: boolean;
  badge?: string;
  placement?: string;
  reason?: string;
}

interface TeamPickerComboboxProps {
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  items: TeamPickerOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export const TeamPickerCombobox: React.FC<TeamPickerComboboxProps> = ({
  label,
  query,
  onQueryChange,
  items,
  selectedId,
  onSelect,
  placeholder,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const listId = React.useId();
  const inputId = React.useId();
  const deferredQuery = React.useDeferredValue(query);

  const filteredItems = React.useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.name, item.badge, item.placement, item.reason].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [deferredQuery, items]);
  const activeItemId = open && filteredItems[highlightedIndex] ? `${listId}-option-${filteredItems[highlightedIndex]!.id}` : undefined;

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [deferredQuery, items.length]);

  const moveHighlight = (direction: 1 | -1) => {
    if (!filteredItems.length) return;
    let next = highlightedIndex;
    for (let i = 0; i < filteredItems.length; i += 1) {
      next = (next + direction + filteredItems.length) % filteredItems.length;
      if (!filteredItems[next]?.disabled) {
        setHighlightedIndex(next);
        return;
      }
    }
    setHighlightedIndex(next);
  };

  const selectHighlighted = () => {
    const option = filteredItems[highlightedIndex];
    if (!option || option.disabled) return;
    onSelect(option.id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-2 block text-xs font-semibold text-[var(--editor-text-secondary)]">{label}</label>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeItemId}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--editor-text-muted)]" />
        <input
          id={inputId}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              moveHighlight(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              moveHighlight(-1);
            } else if (event.key === 'Enter') {
              if (!open) return;
              event.preventDefault();
              selectHighlighted();
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder ?? t('team_picker_default_placeholder')}
          className="h-11 w-full rounded-[14px] border border-[color:var(--editor-border-default)] bg-[var(--editor-bg-surface)] pl-10 pr-10 text-sm font-medium text-[var(--editor-text-primary)] shadow-[0_8px_18px_-20px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.6)] transition-all duration-150 placeholder:text-[var(--editor-text-muted)] hover:border-[color:var(--editor-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
        />
        {query ? (
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onQueryChange('');
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1 text-[var(--editor-text-muted)] transition-colors hover:bg-[var(--editor-bg-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
            aria-label={t('team_picker_clear_search')}
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] shadow-[0_24px_60px_-38px_rgba(15,23,42,0.35)]"
        >
          {filteredItems.length ? (
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredItems.map((item, index) => {
                const active = index === highlightedIndex;
                const selected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    id={`${listId}-option-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={item.disabled}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (item.disabled) return;
                      onSelect(item.id);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full min-h-[52px] rounded-[14px] border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                      item.disabled
                        ? 'cursor-not-allowed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-disabled)] text-[var(--editor-text-disabled)] shadow-none'
                        : active || selected
                          ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-selected)] text-[var(--editor-text-primary)] shadow-[0_12px_24px_-22px_rgba(37,99,235,0.35)]'
                          : 'border-transparent bg-[var(--editor-bg-surface)] text-[var(--editor-text-primary)] hover:bg-[var(--editor-bg-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold whitespace-normal break-words leading-tight">{item.name}</div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {item.badge ? (
                            <span className="inline-flex min-h-5 items-center rounded-full border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--editor-text-secondary)]">
                              {item.badge}
                            </span>
                          ) : null}
                          {item.placement ? (
                            <span className="text-[11px] font-medium text-[var(--editor-text-muted)]">{item.placement}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {item.reason ? (
                      <div className={`mt-1 text-[11px] font-medium ${item.disabled ? 'text-[var(--editor-text-secondary)]' : 'text-[var(--editor-text-muted)]'}`}>
                        {item.reason}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-5 text-center">
              <div className="text-sm font-semibold text-[var(--editor-text-primary)]">{t('team_picker_no_results')}</div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('team_picker_no_results_hint')}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

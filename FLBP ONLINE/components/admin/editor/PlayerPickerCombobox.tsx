import React from 'react';
import type { PlayerProfileSnapshot } from '../../../types';
import { formatBirthDateDisplay, getPlayerKey, getPlayerKeyLabel, normalizeBirthDateInput } from '../../../services/playerIdentity';
import { BirthDateInput } from '../BirthDateInput';

export interface EditionPlayer {
    name: string;
    birthDate: string;
    playerId: string;
    confirmed: boolean;
}
export const emptyEditionPlayer = (): EditionPlayer => ({ name: '', birthDate: '', playerId: '', confirmed: false });

export const PlayerPickerCombobox: React.FC<{
    value: EditionPlayer;
    onChange: (value: EditionPlayer) => void;
    profiles: PlayerProfileSnapshot[];
    label: string;
    t: (key: string) => string;
    disabled?: boolean;
}> = ({ value, onChange, profiles, label, t, disabled }) => {
    const id = React.useId();
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(0);
    const matches = profiles.filter(row => row.displayName.toLocaleLowerCase().includes(value.name.trim().toLocaleLowerCase())).slice(0, 20);
    const existing = profiles.some(row => row.playerId === value.playerId);
    const select = (index: number) => {
        const profile = matches[index];
        if (profile) onChange({ name: profile.displayName, birthDate: formatBirthDateDisplay(getPlayerKeyLabel(profile.playerId).yob) || '', playerId: profile.playerId, confirmed: true });
        else if (value.name.trim()) onChange({ ...value, name: value.name.trim(), playerId: getPlayerKey(value.name, value.birthDate || 'ND'), confirmed: true });
        setOpen(false);
    };
    const input = 'w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-beer-500 disabled:bg-slate-100';
    return <div className="min-w-0 space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
        <label htmlFor={id} className="block text-xs font-bold text-slate-600">{label}</label>
        <div className="relative">
            <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={`${id}-options`}
                aria-activedescendant={open ? `${id}-option-${active}` : undefined} autoComplete="off" disabled={disabled}
                value={value.name} className={input} onFocus={() => setOpen(true)}
                onChange={event => { onChange({ ...emptyEditionPlayer(), name: event.target.value }); setActive(0); setOpen(true); }}
                onKeyDown={event => {
                    if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(matches.length, n + (event.key === 'ArrowDown' ? 1 : -1)))); }
                    if (event.key === 'Enter' && open) { event.preventDefault(); select(active); }
                }} />
            {open && !disabled && <ul id={`${id}-options`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-xl">
                {matches.map((profile, index) => <li key={profile.playerId} id={`${id}-option-${index}`} role="option" aria-selected={active === index}>
                    <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => select(index)} className={`w-full rounded-lg p-2 text-left text-sm ${active === index ? 'bg-amber-100' : 'hover:bg-slate-100'}`}>
                        <strong>{profile.displayName}</strong><span className="block text-xs text-slate-600">{profile.yobLabel} · {profile.totalTitles} {t('edition_titles')}</span>
                    </button>
                </li>)}
                {!!value.name.trim() && <li id={`${id}-option-${matches.length}`} role="option" aria-selected={active === matches.length}>
                    <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => select(matches.length)} className="w-full rounded-lg border-t p-2 text-left text-sm font-bold text-blue-700">{t('edition_new_player')}: {value.name}</button>
                </li>}
            </ul>}
        </div>
        {value.confirmed && <>
            <span className="block text-xs font-bold text-slate-600">{t(existing ? 'edition_existing_player' : 'edition_new_player')}</span>
            <BirthDateInput value={value.birthDate} disabled={disabled || existing} ariaLabel={`${label} · ${t('birth_date')}`} className={input}
                onChange={birthDate => onChange({ ...value, birthDate, playerId: getPlayerKey(value.name, normalizeBirthDateInput(birthDate) || 'ND') })} />
            {!value.birthDate && <p className="text-xs text-amber-800">{t('edition_unknown_birth')}</p>}
        </>}
        {!!value.name && !value.confirmed && <p className="text-xs text-amber-800">{t('edition_choose_player')}</p>}
    </div>;
};

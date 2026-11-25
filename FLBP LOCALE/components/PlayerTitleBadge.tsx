import React from 'react';
import { Star, Trophy, Wind } from 'lucide-react';
import type { HallOfFameEntry } from '../types';
import { useTranslation } from '../App';
import { PlasticCupIcon } from './icons/PlasticCupIcon';

type TitleType = HallOfFameEntry['type'];

// Under 25 awards share the symbol of the main one: the green pill tells them apart.
const titleBadges: Record<TitleType, { label: string; Icon: React.ComponentType<{ className?: string }>; color: string }> = {
    winner: { label: 'edition_award_winner', Icon: Trophy, color: 'border-amber-200 bg-amber-50 text-amber-900' },
    top_scorer: { label: 'edition_award_top_scorer', Icon: PlasticCupIcon, color: 'border-orange-200 bg-orange-50 text-orange-900' },
    defender: { label: 'edition_award_defender', Icon: Wind, color: 'border-sky-200 bg-sky-50 text-sky-900' },
    mvp: { label: 'edition_award_mvp', Icon: Star, color: 'border-violet-200 bg-violet-50 text-violet-900' },
    top_scorer_u25: { label: 'edition_award_top_scorer_u25', Icon: PlasticCupIcon, color: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
    defender_u25: { label: 'edition_award_defender_u25', Icon: Wind, color: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
};

export const PLAYER_TITLE_TYPES = Object.keys(titleBadges) as TitleType[];

/** Symbol and number only: the name of the title appears on hover and to screen readers. */
export const PlayerTitleBadge: React.FC<{ type: TitleType; count?: number }> = ({ type, count }) => {
    const { t } = useTranslation();
    const { label, Icon, color } = titleBadges[type];
    const name = t(label);
    return (
        <span
            role="img"
            title={name}
            aria-label={count ? `${name} ×${count}` : name}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-bold leading-tight ${color}`}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {count ? <span className="tabular-nums">×{count}</span> : null}
        </span>
    );
};

import React from 'react';
import { Crosshair, GitMerge, Trophy, Users } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import { IntegrationsHof } from './IntegrationsHof';
import { IntegrationsScorers } from './IntegrationsScorers';
import { IntegrationsAliases } from './IntegrationsAliases';
import { PlayersSubTab } from './PlayersSubTab';

export const IntegrationsSubTab: React.FC<DataTabProps> = (props) => {
    const { integrationsSubTab, setIntegrationsSubTab, t } = props;

    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const tabBtnBase = `px-3 py-2.5 rounded-xl font-black border text-sm inline-flex items-center gap-2 ${ring}`;
    const tabBtnActive = 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800';
    const tabBtnInactive = 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';

    return (
        <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-black text-slate-900">{t('integrations_shared_title')}</div>
                        <div className="text-xs text-slate-600 font-bold mt-1">
                            {t('integrations_shared_desc')}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label={t('integrations_toolbar')}>
                        <button type="button"
                            onClick={() => {
                                setIntegrationsSubTab('hof');
                                try { sessionStorage.setItem('flbp_admin_integrations_subtab', 'hof'); } catch {}
                            }}
                            className={`${tabBtnBase} ${integrationsSubTab === 'hof' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <Trophy className="w-4 h-4" />
                            {t('hof')}
                        </button>
                        <button type="button"
                            onClick={() => {
                                setIntegrationsSubTab('scorers');
                                try { sessionStorage.setItem('flbp_admin_integrations_subtab', 'scorers'); } catch {}
                            }}
                            className={`${tabBtnBase} ${integrationsSubTab === 'scorers' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <Crosshair className="w-4 h-4" />
                            {t('scorers_label')}
                        </button>
                        <button type="button"
                            onClick={() => {
                                setIntegrationsSubTab('aliases');
                                try { sessionStorage.setItem('flbp_admin_integrations_subtab', 'aliases'); } catch {}
                            }}
                            className={`${tabBtnBase} ${integrationsSubTab === 'aliases' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <GitMerge className="w-4 h-4" />
                            {t('aliases_label')}
                        </button>
                        <button type="button"
                            onClick={() => {
                                setIntegrationsSubTab('players');
                                try { sessionStorage.setItem('flbp_admin_integrations_subtab', 'players'); } catch {}
                            }}
                            className={`${tabBtnBase} ${integrationsSubTab === 'players' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <Users className="w-4 h-4" />
                            {t('players')}
                        </button>
                    </div>
                </div>
            </div>

            {integrationsSubTab === 'hof' ? (
                <IntegrationsHof {...props} />
            ) : integrationsSubTab === 'scorers' ? (
                <IntegrationsScorers {...props} />
            ) : integrationsSubTab === 'players' ? (
                <PlayersSubTab {...props} />
            ) : (
                <IntegrationsAliases {...props} />
            )}
        </div>
    );
};

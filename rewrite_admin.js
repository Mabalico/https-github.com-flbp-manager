const fs = require('fs');

const pathOnline = 'FLBP ONLINE/components/AdminDashboard.tsx';
const pathLocale = 'FLBP LOCALE/components/AdminDashboard.tsx';

let oldContent = fs.readFileSync(pathOnline, 'utf8');

// Trova dove inizia la dashboard
const startStr = '	        <div className="animate-fade-in flex flex-col md:flex-row min-h-[calc(100vh-2rem)] gap-4 lg:gap-6 lg:p-4 mb-8">';

// Trova dove inizia il content
const midStr = '                <div className="flex-1 rounded-[24px] lg:rounded-[32px] border border-slate-200 border-white/40 bg-white/70 backdrop-blur-3xl shadow-lg shadow-black/5 p-4 md:p-6 overflow-hidden flex flex-col">';

if (!oldContent.includes(startStr) || !oldContent.includes(midStr)) {
    console.error("Non trovo gli anchor!");
    process.exit(1);
}

const blockToReplace = oldContent.substring(
    oldContent.indexOf(startStr),
    oldContent.indexOf(midStr) + midStr.length
);

const newBlock = `	        <div className="animate-fade-in flex flex-col min-h-[calc(100vh-2rem)] gap-4 lg:gap-6 lg:p-4 mb-8">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-3xl p-5 md:px-8 rounded-[24px] lg:rounded-[32px] shadow-sm border border-slate-200 border-white/40">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="hidden md:flex text-xl lg:text-2xl font-black items-center gap-2">
                        <ShieldCheck className="w-7 h-7 text-beer-500 drop-shadow-sm" />
                        {t('admin')}
                    </h2>
                    
                    <div className="hidden md:block w-px h-6 bg-slate-200 mx-1"></div>

                    <details className="relative group">
                        <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-2xl font-black hover:bg-slate-800 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 shadow-sm">
                            {adminSection === 'live' ? <><PlayCircle className="w-4 h-4"/> <span className="hidden sm:inline">{t('admin_live_management')}</span></> : adminSection === 'data' ? <><Settings className="w-4 h-4"/> <span className="hidden sm:inline">{t('admin_data_management')}</span></> : <><Brackets className="w-4 h-4"/> <span className="hidden sm:inline">{t('admin_structural_editor')}</span></>}
                            <ChevronDown className="w-4 h-4 opacity-80" />
                        </summary>
                        <div className="absolute left-0 mt-2 min-w-[240px] max-w-[90vw] bg-white border border-slate-200 shadow-xl rounded-[24px] p-2 z-[90]">
                            <div className="grid gap-1">
                                <button type="button" onClick={() => { void switchAdminSection('live'); }} className={\`w-full text-left px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 transition-colors \${adminSection==='live' ? 'bg-emerald-50 text-emerald-800' : 'bg-transparent text-slate-800 hover:bg-slate-100'}\`}>
                                    <PlayCircle className="w-4 h-4" /> {t('admin_live_management')}
                                </button>
                                <button type="button" onClick={() => { void switchAdminSection('data'); }} className={\`w-full text-left px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 transition-colors \${adminSection==='data' ? 'bg-blue-50 text-blue-800' : 'bg-transparent text-slate-800 hover:bg-slate-100'}\`}>
                                    <Settings className="w-4 h-4" /> {t('admin_data_management')}
                                </button>
                                <button type="button" onClick={() => { void switchAdminSection('editor'); }} className={\`w-full text-left px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 transition-colors \${adminSection==='editor' ? 'bg-blue-50 text-blue-800' : 'bg-transparent text-slate-800 hover:bg-slate-100'}\`}>
                                    <Brackets className="w-4 h-4" /> {t('admin_structural_editor')}
                                </button>
                            </div>
                        </div>
                    </details>

                    {adminSection === 'live' && (
                         <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                             {t('live_badge')}
                         </span>
                    )}
                    {adminSection === 'editor' && (
                         <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
                             {t('admin_structural_editor')}
                         </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {adminSection === 'live' && (
                        <>
                            <details className="relative group">
                                <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-black hover:bg-emerald-800 transition-colors cursor-pointer select-none focus-visible:outline-none shadow-sm">
                                    <MonitorPlay className="w-4 h-4" /> <span className="hidden sm:inline">{t('admin_open_tv')}</span>
                                    <ChevronDown className="w-4 h-4 opacity-80" />
                                </summary>
                                <div className="absolute right-0 mt-2 min-w-[260px] max-w-[90vw] bg-white border border-slate-200 shadow-xl rounded-[24px] p-2 z-[90]">
                                    <div className="grid gap-1">
                                        <button type="button" onClick={() => onEnterTv('groups')} className="w-full text-left bg-transparent text-slate-800 px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 hover:bg-slate-100 transition-colors">
                                            <div className="p-1.5 rounded-full bg-slate-900 text-white"><MonitorPlay className="w-3 h-3"/></div> {t('admin_tv_groups')}
                                        </button>
                                        <button type="button" onClick={() => onEnterTv('groups_bracket')} className="w-full text-left bg-transparent text-slate-800 px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 hover:bg-slate-100 transition-colors">
                                            <div className="p-1.5 rounded-full bg-slate-900 text-white"><MonitorPlay className="w-3 h-3"/></div> {t('admin_tv_groups_bracket')}
                                        </button>
                                        <button type="button" onClick={() => onEnterTv('bracket')} className="w-full text-left bg-transparent text-slate-800 px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 hover:bg-slate-100 transition-colors">
                                            <div className="p-1.5 rounded-full bg-slate-900 text-white"><MonitorPlay className="w-3 h-3"/></div> {t('admin_tv_bracket')}
                                        </button>
                                        <button type="button" onClick={() => onEnterTv('scorers')} className="w-full text-left bg-transparent text-slate-800 px-4 py-3 rounded-[16px] font-black inline-flex items-center gap-3 hover:bg-slate-100 transition-colors">
                                            <div className="p-1.5 rounded-full bg-slate-900 text-white"><MonitorPlay className="w-3 h-3"/></div> {t('admin_tv_scorers')}
                                        </button>
                                    </div>
                                </div>
                            </details>

                            <button type="button" onClick={() => openMvpModal(false)} className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 font-black text-slate-700 hover:bg-slate-50 transition-colors shadow-sm" title={t('mvp_plural')}>
                                <span className="text-base select-none">⭐</span>
                                <span className="hidden lg:inline">{t('mvp_plural')}</span>
                                {state.tournament && (
                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                        {(() => {
                                            const c = (state.hallOfFame || []).filter(e => e.tournamentId === state.tournament!.id && e.type === 'mvp').length;
                                            return c;
                                        })()}
                                    </span>
                                )}
                            </button>
                            <button type="button" onClick={handleArchive} className="bg-red-50 text-red-700 border border-red-200 px-4 py-2.5 rounded-2xl font-black inline-flex items-center gap-2 hover:bg-red-100 transition-colors shadow-sm">
                                <Archive className="w-4 h-4" /> <span className="hidden sm:inline">{t('complete_tournament')}</span>
                            </button>
                        </>
                    )}

                    <div className="w-px h-6 bg-slate-200 mx-1"></div>

                    <details className="relative group">
                        <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center justify-center p-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm text-slate-700" title={t('admin_tools')}>
                            <Settings className="w-5 h-5" />
                        </summary>
                        <div className="absolute right-0 mt-2 min-w-[280px] max-w-[90vw] bg-white border border-slate-200 shadow-xl rounded-[24px] p-4 z-[90] flex flex-col gap-4">
                            <div className="text-sm font-black uppercase tracking-wider text-slate-400">{t('admin_tools')}</div>
                            
                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col gap-2 text-sm font-semibold">
                                <div className="truncate text-slate-700 font-bold" title={supabaseEmail ? \`\${t('admin_supabase_label')}: \${supabaseEmail}\` : t('admin_session_active')}>
                                    {supabaseEmail ? (<>{t('admin_supabase_label')}: {supabaseEmail}</>) : (<>{t('admin_session_active')}</>)}
                                </div>
                                <button onClick={async () => {
                                    if (!confirm(t('admin_supabase_logout_confirm'))) return;
                                    await performAdminLogout();
                                }} className="text-xs font-black px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors inline-block text-center mt-1">
                                    {t('admin_logout')}
                                </button>
                            </div>

                            <div className={\`text-[11px] font-black px-3 py-2 rounded-2xl flex items-center justify-center text-center \${adminSyncState.phase === 'synced' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 border' : adminSyncState.phase === 'syncing' ? 'bg-sky-50 text-sky-800 border bg-sky-200' : adminSyncState.phase === 'pending' ? 'bg-amber-50 text-amber-900 border-amber-200 border' : adminSyncState.phase === 'error' || adminSyncState.phase === 'conflict' ? 'bg-red-50 text-red-800 border-red-200 border' : 'bg-slate-100 text-slate-600 border border-slate-200'}\`} title={\`\${adminSyncState.message}\${adminSyncState.lastSuccessAt ? \` · \${t('admin_last_ok')}: \${new Date(adminSyncState.lastSuccessAt).toLocaleString()}\` : ''}\`}>
                                 {adminSyncState.phase === 'synced' ? t('admin_sync_ok') : adminSyncState.phase === 'syncing' ? t('admin_syncing') : adminSyncState.phase === 'pending' ? t('admin_pending') : adminSyncState.phase === 'error' ? t('admin_sync_err') : adminSyncState.phase === 'conflict' ? t('admin_sync_conflict') : t('admin_autosave')}
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col gap-2">
                                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-500">
                                    {t('admin_offline_cache')}
                                    <div className={\`px-2 py-0.5 rounded-full \${swDisabled ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-800'}\`}>
                                        {swDisabled ? t('admin_cache_off') : t('admin_cache_on')}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 mt-1">
                                    <button onClick={async () => {
                                        const next = !swDisabled;
                                        const msg = next ? t('admin_disable_cache_confirm') : t('admin_enable_cache_confirm');
                                        if (!confirm(msg)) return;
                                        try { if (next) localStorage.setItem('flbp_sw_disabled', '1'); else localStorage.removeItem('flbp_sw_disabled'); } catch {}
                                        setSwDisabled(next);
                                        if (next) await bestEffortClearSwCaches();
                                        window.location.reload();
                                    }} className={\`text-xs font-black px-3 py-1.5 rounded-xl border \${swDisabled ? 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200' : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border-blue-200'}\`}>
                                        {swDisabled ? t('admin_enable_cache') : t('admin_disable_cache')}
                                    </button>
                                    <button onClick={async () => {
                                        if (!confirm(t('admin_clear_cache_confirm'))) return;
                                        await bestEffortClearSwCaches();
                                        try { localStorage.removeItem('flbp_sw_disabled'); } catch {}
                                        setSwDisabled(false);
                                        window.location.reload();
                                    }} className="text-xs font-black px-3 py-1.5 rounded-xl bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 inline-flex items-center justify-center gap-1">
                                        <Trash2 className="w-3 h-3" /> {t('admin_clear_cache')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex flex-col gap-2">
                                 <div className="text-xs font-black uppercase tracking-wide text-slate-500">{t('admin_mode')}</div>
                                 {isAppModeLockedForPublicDeploy ? (
                                      <div className="text-[11px] font-bold text-emerald-800 bg-emerald-50 rounded-xl p-2 border border-emerald-200 leading-tight">
                                           {t('admin_public_build_locked')}: <br/><span className="font-black text-sm">{t('admin_official_mode')}</span>
                                      </div>
                                 ) : (
                                      <button onClick={() => {
                                           const next = (APP_MODE === 'tester') ? 'official' : 'tester';
                                           const msg = next === 'tester' ? t('admin_switch_to_tester_confirm') : t('admin_switch_to_official_confirm');
                                           if (!confirm(msg)) return;
                                           setAppModeOverride(next);
                                           window.location.reload();
                                      }} className={\`text-xs font-black px-3 py-2 rounded-xl border \${APP_MODE === 'tester' ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}\`}>
                                          {APP_MODE === 'tester' ? t('admin_tester_mode') : t('admin_official_mode')}
                                      </button>
                                 )}
                            </div>
                        </div>
                    </details>
                </div>
            </header>

            {adminSection === 'live' && isTesterMode && (
                <div className="bg-amber-50/90 backdrop-blur-md rounded-3xl p-4 border border-amber-200 shadow-[0_4px_20px_-4px_rgba(251,191,36,0.2)]">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                         <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
                              <span className="text-xl">🧪</span> {t('admin_tester_tools')}
                         </div>
                         <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={handleSimulateTurn} disabled={simBusy} className="bg-amber-500 text-white px-3 py-1.5 rounded-xl font-black text-xs inline-flex items-center gap-1.5 hover:bg-amber-600 disabled:opacity-50">
                                {t('admin_simulate_turn_button')}
                            </button>
                            <button type="button" onClick={handleSimulateAll} disabled={simBusy} className="bg-amber-600 text-white px-3 py-1.5 rounded-xl font-black text-xs inline-flex items-center gap-1.5 hover:bg-amber-700 disabled:opacity-50">
                                {t('admin_simulate_all_button')}
                            </button>
                            <button type="button" onClick={handleDeleteLiveTournament} disabled={!state.tournament} className="bg-red-600 text-white px-3 py-1.5 rounded-xl font-black text-xs inline-flex items-center gap-1.5 hover:bg-red-700 disabled:opacity-50">
                                <Trash2 className="w-3 h-3" /> {t('delete')} {t('monitor_live_tournament_label')}
                            </button>
                         </div>
                    </div>
                </div>
            )}

            <main className="flex-1 rounded-[24px] lg:rounded-[32px] border border-slate-200 border-white/40 bg-white/70 backdrop-blur-3xl shadow-lg shadow-black/5 p-4 md:p-6 overflow-hidden flex flex-col">`;

fs.writeFileSync(pathOnline, oldContent.replace(blockToReplace, newBlock), 'utf8');

let localeContent = fs.readFileSync(pathLocale, 'utf8');
fs.writeFileSync(pathLocale, localeContent.replace(blockToReplace, newBlock), 'utf8');

console.log("Rimpiazzo Completato");

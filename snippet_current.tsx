	        <div className="animate-fade-in flex flex-col md:flex-row min-h-[calc(100vh-2rem)] gap-4 lg:gap-6 lg:p-4 mb-8">
            <aside className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col gap-6 bg-white/70 backdrop-blur-xl p-5 lg:p-6 rounded-[24px] lg:rounded-[32px] shadow-sm border border-slate-200 border-white/40">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-black flex items-center gap-2 mb-4">
                        <ShieldCheck className="w-8 h-8 text-beer-500 drop-shadow-sm" />
                        {t('admin')}
                    </h2>
                    
                    <nav role="tablist" aria-label={t('admin_sections_aria')} className="flex flex-col gap-2">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={adminSection==='live'}
                            onMouseEnter={() => primeAdminContentChunk(resolveStoredLiveTab())}
                            onFocus={() => primeAdminContentChunk(resolveStoredLiveTab())}
                            onClick={() => { void switchAdminSection('live'); }}
                            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-black inline-flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='live' ? 'bg-emerald-600 text-white shadow-md scale-[1.02]' : 'bg-white/50 text-slate-700 hover:bg-white shadow-sm border border-slate-200 border-white/60'}`}
                        >
                            <PlayCircle className="w-5 h-5 flex-shrink-0" aria-hidden /> {t('admin_live_management')}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={adminSection==='data'}
                            onMouseEnter={() => primeAdminContentChunk('data')}
                            onFocus={() => primeAdminContentChunk('data')}
                            onClick={() => { void switchAdminSection('data'); }}
                            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-black inline-flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='data' ? 'bg-blue-700 text-white shadow-md scale-[1.02]' : 'bg-white/50 text-slate-700 hover:bg-white shadow-sm border border-slate-200 border-white/60'}`}
                        >
                            <Settings className="w-5 h-5 flex-shrink-0" aria-hidden /> {t('admin_data_management')}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={adminSection==='editor'}
                            onMouseEnter={() => primeAdminContentChunk('editor')}
                            onFocus={() => primeAdminContentChunk('editor')}
                            onClick={() => { void switchAdminSection('editor'); }}
                            className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-black inline-flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='editor' ? 'bg-blue-700 text-white shadow-md scale-[1.02]' : 'bg-white/50 text-slate-700 hover:bg-white shadow-sm border border-slate-200 border-white/60'}`}
                        >
                            <Brackets className="w-5 h-5 flex-shrink-0" aria-hidden /> {t('admin_structural_editor')}
                        </button>
                    </nav>
                </div>
                
                <div className="mt-auto flex flex-col gap-4 pt-6 border-t border-slate-200">
                    <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">{t('admin_tools')}</div>
                    
                    <div className="bg-white/50 border border-slate-200 border-white/60 rounded-2xl p-3 shadow-sm flex flex-col gap-2 text-sm font-semibold">
                        <div className="truncate text-slate-700 font-bold" title={supabaseEmail ? `${t('admin_supabase_label')}: ${supabaseEmail}` : t('admin_session_active')}>
                            {supabaseEmail ? (<>{t('admin_supabase_label')}: {supabaseEmail}</>) : (<>{t('admin_session_active')}</>)}
                        </div>
                        <button onClick={async () => {
                            if (!confirm(t('admin_supabase_logout_confirm'))) return;
                            await performAdminLogout();
                        }} className="text-xs font-black px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors inline-block text-center mt-1">
                            {t('admin_logout')}
                        </button>
                    </div>

                    <div className={`text-[11px] font-black px-3 py-2 rounded-2xl flex items-center justify-center text-center ${adminSyncState.phase === 'synced' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 border' : adminSyncState.phase === 'syncing' ? 'bg-sky-50 text-sky-800 border bg-sky-200' : adminSyncState.phase === 'pending' ? 'bg-amber-50 text-amber-900 border-amber-200 border' : adminSyncState.phase === 'error' || adminSyncState.phase === 'conflict' ? 'bg-red-50 text-red-800 border-red-200 border' : 'bg-slate-100 text-slate-600 border border-slate-200'}`} title={`${adminSyncState.message}${adminSyncState.lastSuccessAt ? ` · ${t('admin_last_ok')}: ${new Date(adminSyncState.lastSuccessAt).toLocaleString()}` : ''}`}>
                         {adminSyncState.phase === 'synced' ? t('admin_sync_ok') : adminSyncState.phase === 'syncing' ? t('admin_syncing') : adminSyncState.phase === 'pending' ? t('admin_pending') : adminSyncState.phase === 'error' ? t('admin_sync_err') : adminSyncState.phase === 'conflict' ? t('admin_sync_conflict') : t('admin_autosave')}
                    </div>

                    <div className="bg-white/50 border border-slate-200 border-white/60 rounded-2xl p-3 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-500">
                            {t('admin_offline_cache')}
                            <div className={`px-2 py-0.5 rounded-full ${swDisabled ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-800'}`}>
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
                            }} className={`text-xs font-black px-3 py-1.5 rounded-xl border ${swDisabled ? 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200' : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border-blue-200'}`}>
                                {swDisabled ? t('admin_enable_cache') : t('admin_disable_cache')}
                            </button>
                            <button onClick={async () => {
                                if (!confirm(t('admin_clear_cache_confirm'))) return;
                                await bestEffortClearSwCaches();
                                try { localStorage.removeItem('flbp_sw_disabled'); } catch {}
                                setSwDisabled(false);
                                window.location.reload();
                            }} className="text-xs font-black px-3 py-1.5 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 inline-flex items-center justify-center gap-1">
                                <Trash2 className="w-3 h-3" /> {t('admin_clear_cache')}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white/50 border border-slate-200 border-white/60 rounded-2xl p-3 shadow-sm flex flex-col gap-2">
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
                              }} className={`text-xs font-black px-3 py-2 rounded-xl border ${APP_MODE === 'tester' ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}`}>
                                  {APP_MODE === 'tester' ? t('admin_tester_mode') : t('admin_official_mode')}
                              </button>
                         )}
                    </div>
                </div>
            </aside>
            
            <main className="flex-1 flex flex-col min-w-0 gap-4 md:gap-6">
                <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white/80 backdrop-blur-3xl p-5 md:px-8 rounded-[24px] lg:rounded-[32px] shadow-sm border border-slate-200 border-white/40">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <h3 className="text-xl md:text-2xl font-black">
                             {adminSection === 'live' ? t('admin_live_management') : adminSection === 'data' ? t('admin_data_management') : t('admin_structural_editor')}
                        </h3>
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
                                    <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-2xl font-black hover:bg-slate-800 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 shadow-sm">
                                        <MonitorPlay className="w-4 h-4" /> <span className="hidden sm:inline">{t('admin_open_tv')}</span>
                                        <ChevronDown className="w-4 h-4 opacity-80" />
                                    </summary>
                                    <div className="absolute right-0 mt-2 min-w-[260px] bg-white/95 backdrop-blur-xl border border-slate-200 border-white/50 shadow-2xl rounded-[24px] p-2 z-[90]">
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

                <div className="flex-1 rounded-[24px] lg:rounded-[32px] border border-slate-200 border-white/40 bg-white/70 backdrop-blur-3xl shadow-lg shadow-black/5 p-4 md:p-6 overflow-hidden flex flex-col">

                    {adminSection === 'live' ? (
                        <nav aria-label={t('admin_tabs_aria')} className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">{t('admin_ops_hub')}</span>
                                    <div className="text-sm font-black text-blue-800 bg-blue-50 border border-blue-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_area_label')}: <span className="font-black">{liveTabMeta[tab as LiveAdminTab]?.title || '-'}</span>
                                    </div>
                                    <div className="text-sm font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_guiding_match')}:  <span className="font-mono">{liveOpsSummary.current?.code || '-'}</span>
                                    </div>
                                    <div className="text-sm font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_to_play')}:  <span className="font-black">{liveOpsSummary.scheduledCount}</span>
                                    </div>
                                    <div className="text-sm font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_playing_count_label')}:  <span className="font-black">{liveOpsSummary.playingCount}</span>
                                    </div>
                                    <div className="text-sm font-black text-rose-800 bg-rose-50 border border-rose-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_finished_count_label')}:  <span className="font-black">{liveOpsSummary.finishedCount}</span>
                                    </div>
                                </div>

                                <div className="relative border-t border-slate-100 pt-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            aria-current={tab === 'teams' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('teams')}
                                            onFocus={() => primeAdminContentChunk('teams')}
                                            onClick={() => { void openLiveTab('teams'); }}
                                            className={tabBtnClass(tab === 'teams')}
                                        >
                                            <Users className="w-4 h-4" /> {t('teams')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'structure' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('structure')}
                                            onFocus={() => primeAdminContentChunk('structure')}
                                            onClick={() => { void openLiveTab('structure'); }}
                                            className={tabBtnClass(tab === 'structure')}
                                        >
                                            <Brackets className="w-4 h-4" /> {t('structure')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'reports' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('reports')}
                                            onFocus={() => primeAdminContentChunk('reports')}
                                            onClick={() => { void openLiveTab('reports'); }}
                                            className={tabBtnClass(tab === 'reports')}
                                        >
                                            <ClipboardList className="w-4 h-4" /> {t('reports')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'referees' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('referees')}
                                            onFocus={() => primeAdminContentChunk('referees')}
                                            onClick={() => { void openLiveTab('referees'); }}
                                            className={tabBtnClass(tab === 'referees')}
                                        >
                                            <ShieldCheck className="w-4 h-4" /> {t('referees')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'codes' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('codes')}
                                            onFocus={() => primeAdminContentChunk('codes')}
                                            onClick={() => { void openLiveTab('codes'); }}
                                            className={tabBtnClass(tab === 'codes')}
                                        >
                                            <ListChecks className="w-4 h-4" /> {t('code_list')}
                                        </button>
                                        {(showGroupsMonitor && showBracketMonitor) ? (
                                            <button
                                                type="button"
                                                ref={monitorMenuButtonRef}
                                                aria-expanded={monitorMenuOpen}
                                                onClick={() => setMonitorMenuOpen(v => !v)}
                                                className={tabBtnClass(tab === 'monitor_groups' || tab === 'monitor_bracket')}
                                            >
                                                <LayoutDashboard className="w-4 h-4" /> {t('admin_monitor_label')}
                                                <ChevronDown className={`w-4 h-4 opacity-80 transition-transform ${monitorMenuOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                        ) : null}
                                        {showGroupsMonitor && !showBracketMonitor ? (
                                            <button
                                                type="button"
                                                aria-current={tab === 'monitor_groups' ? 'page' : undefined}
                                                onMouseEnter={() => primeAdminContentChunk('monitor_groups')}
                                                onFocus={() => primeAdminContentChunk('monitor_groups')}
                                                onClick={() => { void openLiveTab('monitor_groups'); }}
                                                className={tabBtnClass(tab === 'monitor_groups')}
                                            >
                                                <LayoutDashboard className="w-4 h-4" /> {t('monitor_groups')}
                                            </button>
                                        ) : null}
                                        {!showGroupsMonitor && showBracketMonitor ? (
                                            <button
                                                type="button"
                                                aria-current={tab === 'monitor_bracket' ? 'page' : undefined}
                                                onMouseEnter={() => primeAdminContentChunk('monitor_bracket')}
                                                onFocus={() => primeAdminContentChunk('monitor_bracket')}
                                                onClick={() => { void openLiveTab('monitor_bracket'); }}
                                                className={tabBtnClass(tab === 'monitor_bracket')}
                                            >
                                                <Brackets className="w-4 h-4" /> {t('monitor_bracket')}
                                            </button>
                                        ) : null}
                                    </div>

                                    {(showGroupsMonitor && showBracketMonitor && monitorMenuOpen) ? (
                                        <div
                                            className="fixed min-w-[240px] max-w-[92vw] bg-white border border-slate-200 shadow-xl rounded-2xl p-2 z-[60]"
                                            style={{ left: `${monitorMenuPosition.left}px`, top: `${monitorMenuPosition.top}px` }}
                                        >
                                            <div className="grid gap-2">
                                                <button
                                                    type="button"
                                                    onMouseEnter={() => primeAdminContentChunk('monitor_groups')}
                                                    onFocus={() => primeAdminContentChunk('monitor_groups')}
                                                    onClick={() => {
                                                        void openLiveTab('monitor_groups');
                                                        setMonitorMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${tab === 'monitor_groups' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-50'}`}
                                                >
                                                    <LayoutDashboard className="w-4 h-4" /> {t('monitor_groups')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onMouseEnter={() => primeAdminContentChunk('monitor_bracket')}
                                                    onFocus={() => primeAdminContentChunk('monitor_bracket')}
                                                    onClick={() => {
                                                        void openLiveTab('monitor_bracket');
                                                        setMonitorMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${tab === 'monitor_bracket' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-50'}`}
                                                >
                                                    <Brackets className="w-4 h-4" /> {t('monitor_bracket')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </nav>
                    ) : adminSection === 'data' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_data_section')} description={t('admin_loading_non_blocking')} />}>
                            <DataTabLazy {...dataTabProps} embedded />
                        </React.Suspense>
                    ) : adminSection === 'editor' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_tournament_editor')} description={t('admin_loading_non_blocking')} />}>
                            <TournamentEditorTabLazy {...tournamentEditorTabProps} />
                        </React.Suspense>
                    ) : null}
                </div>

            {/* TAB CONTENT */}
const fs = require('fs');

const snippet = fs.readFileSync('snippet_current.tsx', 'utf8');

const anchor1 = "} : adminSection === 'data' ? (\\n                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_data_section')} description={t('admin_loading_non_blocking')} />}>\\n                            <DataTabLazy {...dataTabProps} embedded />\\n                        </React.Suspense>\\n                    ) : adminSection === 'editor' ? (\\n                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_tournament_editor')} description={t('admin_loading_non_blocking')} />}>\\n                            <TournamentEditorTabLazy {...tournamentEditorTabProps} />\\n                        </React.Suspense>\\n                    ) : null}";

const goodContent = `                    ) : adminSection === 'data' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_data_section')} description={t('admin_loading_non_blocking')} />}>
                            <DataTabLazy {...dataTabProps} embedded />
                        </React.Suspense>
                    ) : adminSection === 'editor' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_tournament_editor')} description={t('admin_loading_non_blocking')} />}>
                            <TournamentEditorTabLazy {...tournamentEditorTabProps} />
                        </React.Suspense>
                    ) : null}
                </main>

            {/* TAB CONTENT */}`;

const fileOnline = 'FLBP ONLINE/components/AdminDashboard.tsx';
let online = fs.readFileSync(fileOnline, 'utf8');

const s1 = online.indexOf(") : adminSection === 'data' ? (");
const e1 = online.indexOf("{/* TAB CONTENT */}");
if (s1 !== -1 && e1 !== -1) {
    online = online.substring(0, s1) + goodContent + online.substring(e1 + 19);
    fs.writeFileSync(fileOnline, online, 'utf8');
    console.log("Online fixed");
}

const fileLocale = 'FLBP LOCALE/components/AdminDashboard.tsx';
let locale = fs.readFileSync(fileLocale, 'utf8');

const s2 = locale.indexOf(") : adminSection === 'data' ? (");
const e2 = locale.indexOf("{/* TAB CONTENT */}");
if (s2 !== -1 && e2 !== -1) {
    locale = locale.substring(0, s2) + goodContent + locale.substring(e2 + 19);
    fs.writeFileSync(fileLocale, locale, 'utf8');
    console.log("Locale fixed");
}

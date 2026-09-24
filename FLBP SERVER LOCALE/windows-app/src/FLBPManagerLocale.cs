using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("FLBP Manager Locale")]
[assembly: AssemblyDescription("Applicazione Windows per la gestione locale dei tornei FLBP")]
[assembly: AssemblyCompany("Federazione Lucense Beer Pong")]
[assembly: AssemblyProduct("FLBP Manager Locale")]
[assembly: AssemblyCopyright("Federazione Lucense Beer Pong")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Flbp.ManagerLocale
{
    internal static class Program
    {
        private const string SingleInstanceMutexName = @"Local\FLBPManagerLocale.SingleInstance";
        private const int RestoreWindowCommand = 9;

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr windowHandle);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr windowHandle, int command);

        [STAThread]
        private static void Main()
        {
            bool ownsSingleInstance;
            using (var instanceMutex = new System.Threading.Mutex(true, SingleInstanceMutexName, out ownsSingleInstance))
            {
                if (!ownsSingleInstance)
                {
                    ActivateExistingInstance();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs args)
                {
                    AppLog.Write(args.Exception);
                    MessageBox.Show(
                        "FLBP Manager Locale ha incontrato un errore.\n\n" + args.Exception.Message +
                        "\n\nIl dettaglio e stato salvato in logs\\windows-app.log.",
                        "FLBP Manager Locale",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                };
                AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs args)
                {
                    AppLog.Write(args.ExceptionObject as Exception);
                };

                Application.Run(new MainForm());
                GC.KeepAlive(instanceMutex);
            }
        }

        private static void ActivateExistingInstance()
        {
            try
            {
                using (var current = Process.GetCurrentProcess())
                {
                    foreach (var candidate in Process.GetProcessesByName(current.ProcessName))
                    {
                        try
                        {
                            if (candidate.Id == current.Id || candidate.MainWindowHandle == IntPtr.Zero) continue;
                            ShowWindowAsync(candidate.MainWindowHandle, RestoreWindowCommand);
                            SetForegroundWindow(candidate.MainWindowHandle);
                            return;
                        }
                        finally
                        {
                            candidate.Dispose();
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                AppLog.Write("Impossibile portare in primo piano l'istanza esistente: " + exception.Message);
            }

            MessageBox.Show(
                "FLBP Manager Locale e gia aperto su questo PC.",
                "FLBP Manager Locale",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
    }

    internal sealed class MainForm : Form
    {
        private const string PanelUrl = "http://127.0.0.1:8787/";
        private const string ManagerUrl = "http://127.0.0.1:8787/app/";
        private const string HealthUrl = "http://127.0.0.1:8787/health";

        private readonly WebView2 browser;
        private readonly Panel overlay;
        private readonly Label statusLabel;
        private readonly Button retryButton;
        private readonly Label serverLabel;
        private readonly string serverRoot;
        private readonly string nativeWriterWindowId;
        private readonly Timer reconnectTimer;
        private CoreWebView2Environment browserEnvironment;
        private string lastLocalUrl;
        private int reconnectAttempt;
        private bool initializing;

        public MainForm()
        {
            serverRoot = FindServerRoot();
            nativeWriterWindowId = Guid.NewGuid().ToString("N");
            lastLocalUrl = LoadLastLocalUrl();
            AppLog.ServerRoot = serverRoot;

            reconnectTimer = new Timer();
            reconnectTimer.Tick += delegate
            {
                reconnectTimer.Stop();
                BeginInitialization();
            };

            Text = "FLBP Manager Locale";
            StartPosition = FormStartPosition.CenterScreen;
            Width = 1440;
            Height = 900;
            MinimumSize = new Size(1024, 700);
            BackColor = Color.FromArgb(8, 15, 30);

            var topBar = new Panel();
            topBar.Dock = DockStyle.Top;
            topBar.Height = 58;
            topBar.Padding = new Padding(14, 10, 14, 9);
            topBar.BackColor = Color.FromArgb(12, 24, 48);

            var brand = new Label();
            brand.AutoSize = false;
            brand.Width = 250;
            brand.Dock = DockStyle.Left;
            brand.Text = "FLBP  MANAGER LOCALE";
            brand.TextAlign = ContentAlignment.MiddleLeft;
            brand.ForeColor = Color.White;
            brand.Font = new Font("Segoe UI", 12.5f, FontStyle.Bold);

            var panelButton = CreateNavButton("Pannello");
            var managerButton = CreateNavButton("FLBP Manager");
            var backButton = CreateNavButton("Indietro");
            var refreshButton = CreateNavButton("Aggiorna");

            panelButton.Click += delegate { Navigate(PanelUrl); };
            managerButton.Click += delegate { Navigate(ManagerUrl); };
            backButton.Click += delegate
            {
                if (browser.CoreWebView2 != null && browser.CoreWebView2.CanGoBack)
                {
                    browser.CoreWebView2.GoBack();
                }
            };
            refreshButton.Click += delegate
            {
                if (browser.CoreWebView2 != null)
                {
                    browser.CoreWebView2.Reload();
                }
                else
                {
                    BeginInitialization();
                }
            };

            serverLabel = new Label();
            serverLabel.AutoSize = false;
            serverLabel.Width = 180;
            serverLabel.Dock = DockStyle.Right;
            serverLabel.Text = "SERVER: AVVIO...";
            serverLabel.TextAlign = ContentAlignment.MiddleRight;
            serverLabel.ForeColor = Color.FromArgb(255, 193, 92);
            serverLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);

            var buttons = new FlowLayoutPanel();
            buttons.Dock = DockStyle.Fill;
            buttons.FlowDirection = FlowDirection.LeftToRight;
            buttons.WrapContents = false;
            buttons.Padding = new Padding(10, 0, 0, 0);
            buttons.BackColor = Color.Transparent;
            buttons.Controls.Add(panelButton);
            buttons.Controls.Add(managerButton);
            buttons.Controls.Add(backButton);
            buttons.Controls.Add(refreshButton);

            topBar.Controls.Add(buttons);
            topBar.Controls.Add(serverLabel);
            topBar.Controls.Add(brand);

            var content = new Panel();
            content.Dock = DockStyle.Fill;
            content.BackColor = Color.FromArgb(8, 15, 30);

            browser = new WebView2();
            browser.Dock = DockStyle.Fill;
            browser.DefaultBackgroundColor = Color.FromArgb(8, 15, 30);

            overlay = new Panel();
            overlay.Dock = DockStyle.Fill;
            overlay.BackColor = Color.FromArgb(8, 15, 30);

            statusLabel = new Label();
            statusLabel.Dock = DockStyle.Fill;
            statusLabel.Text = "Avvio del server locale...";
            statusLabel.TextAlign = ContentAlignment.MiddleCenter;
            statusLabel.ForeColor = Color.White;
            statusLabel.Font = new Font("Segoe UI", 16f, FontStyle.Bold);

            retryButton = new Button();
            retryButton.Text = "Riprova";
            retryButton.Width = 150;
            retryButton.Height = 42;
            retryButton.Anchor = AnchorStyles.Bottom;
            retryButton.Left = (overlay.Width - retryButton.Width) / 2;
            retryButton.Top = 480;
            retryButton.Visible = false;
            retryButton.FlatStyle = FlatStyle.Flat;
            retryButton.FlatAppearance.BorderSize = 0;
            retryButton.BackColor = Color.FromArgb(91, 72, 235);
            retryButton.ForeColor = Color.White;
            retryButton.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            retryButton.Click += delegate { BeginInitialization(); };

            overlay.Controls.Add(statusLabel);
            overlay.Controls.Add(retryButton);
            overlay.Resize += delegate
            {
                retryButton.Left = Math.Max(20, (overlay.ClientSize.Width - retryButton.Width) / 2);
                retryButton.Top = Math.Max(100, (overlay.ClientSize.Height / 2) + 55);
            };

            content.Controls.Add(browser);
            content.Controls.Add(overlay);
            Controls.Add(content);
            Controls.Add(topBar);

            Shown += delegate { BeginInitialization(); };
            FormClosed += delegate
            {
                reconnectTimer.Stop();
                reconnectTimer.Dispose();
                try
                {
                    browser.Dispose();
                }
                catch (Exception exception)
                {
                    AppLog.Write("Chiusura WebView2 non completata: " + exception.Message);
                }
            };
        }

        private static Button CreateNavButton(string text)
        {
            var button = new Button();
            button.Text = text;
            button.AutoSize = true;
            button.Height = 38;
            button.Margin = new Padding(4, 0, 4, 0);
            button.Padding = new Padding(12, 0, 12, 0);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Color.FromArgb(55, 74, 109);
            button.FlatAppearance.BorderSize = 1;
            button.BackColor = Color.FromArgb(22, 39, 71);
            button.ForeColor = Color.White;
            button.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            button.Cursor = Cursors.Hand;
            return button;
        }

        private void BeginInitialization()
        {
            if (initializing)
            {
                return;
            }

            reconnectTimer.Stop();
            InitializeAsync();
        }

        private async void InitializeAsync()
        {
            initializing = true;
            overlay.Visible = true;
            overlay.BringToFront();
            retryButton.Visible = false;
            statusLabel.Text = "Avvio del server locale...";
            serverLabel.Text = "SERVER: AVVIO...";
            serverLabel.ForeColor = Color.FromArgb(255, 193, 92);

            try
            {
                await EnsureServerAsync();
                serverLabel.Text = "SERVER: PRONTO";
                serverLabel.ForeColor = Color.FromArgb(81, 220, 151);
                statusLabel.Text = "Apertura di FLBP Manager Locale...";

                if (browser.CoreWebView2 == null)
                {
                    var userData = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "FLBP Manager Locale",
                        "WebView2");
                    Directory.CreateDirectory(userData);
                    browserEnvironment = await CoreWebView2Environment.CreateAsync(null, userData);
                    await browser.EnsureCoreWebView2Async(browserEnvironment);
                    await ConfigureBrowserAsync();
                }

                browser.CoreWebView2.Navigate(lastLocalUrl);
            }
            catch (Exception exception)
            {
                AppLog.Write(exception);
                serverLabel.Text = "SERVER: ERRORE";
                serverLabel.ForeColor = Color.FromArgb(255, 105, 105);
                statusLabel.Text = "Impossibile aprire FLBP Manager Locale.\n\n" + exception.Message +
                    "\n\nDettagli: logs\\windows-app.log";
                retryButton.Visible = true;
                retryButton.BringToFront();
                ScheduleReconnect();
            }
            finally
            {
                initializing = false;
            }
        }

        private async Task ConfigureBrowserAsync()
        {
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.IsZoomControlEnabled = true;

            // Stable for the lifetime of this native window and injected
            // before every document. This lets the Admin write lease survive
            // WebView2 Reload/Navigate without making two app processes share
            // the same writer identity.
            await browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "Object.defineProperty(window,'__FLBP_NATIVE_WRITER_WINDOW_ID'," +
                "{value:'" + nativeWriterWindowId + "',configurable:false,enumerable:false,writable:false});");

            browser.CoreWebView2.NavigationCompleted += async delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
            {
                if (args.IsSuccess)
                {
                    // A service worker may render a cached page even while the
                    // SQLite server is down. Never label that state as ready:
                    // cached UI must remain covered until /health responds.
                    if (!await IsHealthyAsync())
                    {
                        overlay.Visible = true;
                        overlay.BringToFront();
                        retryButton.Visible = false;
                        serverLabel.Text = "SERVER: RIAVVIO...";
                        serverLabel.ForeColor = Color.FromArgb(255, 193, 92);
                        statusLabel.Text = "Avvio del server locale in corso...\n\nNuovo tentativo automatico.";
                        ScheduleReconnect();
                        return;
                    }
                    reconnectAttempt = 0;
                    reconnectTimer.Stop();
                    RememberLastLocalUrl(browser.CoreWebView2.Source);
                    overlay.Visible = false;
                    browser.Focus();
                }
                else
                {
                    overlay.Visible = true;
                    overlay.BringToFront();
                    if (!await IsHealthyAsync())
                    {
                        serverLabel.Text = "SERVER: RIAVVIO...";
                        serverLabel.ForeColor = Color.FromArgb(255, 193, 92);
                        statusLabel.Text = "Avvio del server locale in corso...\n\nNuovo tentativo automatico.";
                        retryButton.Visible = false;
                    }
                    else
                    {
                        serverLabel.Text = "SERVER: PRONTO";
                        serverLabel.ForeColor = Color.FromArgb(81, 220, 151);
                        statusLabel.Text = "La pagina locale non ha risposto.\n\nCodice: " + args.WebErrorStatus;
                        retryButton.Visible = true;
                        retryButton.BringToFront();
                    }
                    ScheduleReconnect();
                }
            };

            browser.CoreWebView2.SourceChanged += delegate
            {
                // Also catches SPA history changes that do not create a new
                // document and therefore do not raise NavigationCompleted.
                RememberLastLocalUrl(browser.CoreWebView2.Source);
            };

            browser.CoreWebView2.NewWindowRequested += async delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args)
            {
                if (IsLocalUri(args.Uri))
                {
                    // Local window.open() calls are presentation surfaces. Give
                    // them their own native window so the operator can move the
                    // scoreboard/bracket to another monitor without losing the
                    // Admin screen in this window.
                    var deferral = args.GetDeferral();
                    ProjectionForm projection = null;
                    try
                    {
                        projection = new ProjectionForm(browserEnvironment);
                        projection.Show(this);
                        await projection.PrepareForNewWindowAsync();
                        args.NewWindow = projection.WebView;
                    }
                    catch (Exception exception)
                    {
                        args.Handled = true;
                        if (projection != null && !projection.IsDisposed)
                        {
                            projection.Close();
                        }
                        AppLog.Write(exception);
                        MessageBox.Show(
                            "Impossibile aprire la finestra di proiezione.\n\n" + exception.Message,
                            "FLBP Manager Locale",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                    finally
                    {
                        deferral.Complete();
                    }
                }
                else
                {
                    args.Handled = true;
                    try
                    {
                        Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });
                    }
                    catch (Exception exception)
                    {
                        AppLog.Write(exception);
                    }
                }
            };

            browser.CoreWebView2.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs args)
            {
                AppLog.Write("WebView2 process failed: " + args.ProcessFailedKind);
                overlay.Visible = true;
                overlay.BringToFront();
                statusLabel.Text = "La finestra dell'app si e arrestata. Premi Riprova.";
                retryButton.Visible = true;
                retryButton.BringToFront();
                ScheduleReconnect();
            };
        }

        private void Navigate(string url)
        {
            if (browser.CoreWebView2 == null)
            {
                BeginInitialization();
                return;
            }

            RememberLastLocalUrl(url);
            browser.CoreWebView2.Navigate(url);
        }

        private void ScheduleReconnect()
        {
            if (reconnectTimer.Enabled || IsDisposed)
            {
                return;
            }

            var delays = new[] { 2000, 5000, 15000, 30000 };
            reconnectTimer.Interval = delays[Math.Min(reconnectAttempt, delays.Length - 1)];
            reconnectAttempt += 1;
            reconnectTimer.Start();
        }

        private static string NavigationStateFile()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FLBP Manager Locale",
                "last-local-url.txt");
        }

        private static string LoadLastLocalUrl()
        {
            try
            {
                var stateFile = NavigationStateFile();
                if (!File.Exists(stateFile))
                {
                    return PanelUrl;
                }

                var saved = File.ReadAllText(stateFile).Trim();
                return IsLocalUri(saved) ? saved : PanelUrl;
            }
            catch
            {
                return PanelUrl;
            }
        }

        private void RememberLastLocalUrl(string value)
        {
            if (!IsLocalUri(value))
            {
                return;
            }

            lastLocalUrl = value;
            try
            {
                var stateFile = NavigationStateFile();
                Directory.CreateDirectory(Path.GetDirectoryName(stateFile));
                File.WriteAllText(stateFile, value);
            }
            catch (Exception exception)
            {
                AppLog.Write("Impossibile salvare l'ultima schermata locale: " + exception.Message);
            }
        }

        private static bool IsLocalUri(string value)
        {
            Uri uri;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri))
            {
                return false;
            }

            return (uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                    uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) &&
                   uri.Port == 8787;
        }

        private async Task EnsureServerAsync()
        {
            if (await IsHealthyAsync())
            {
                return;
            }

            if (string.IsNullOrEmpty(serverRoot))
            {
                throw new InvalidOperationException(
                    "Non trovo la cartella FLBP SERVER LOCALE. L'eseguibile deve restare nella sua cartella publish.");
            }

            // Prefer the installed watchdog task so there is only one owner of
            // the server process. This avoids a race between an app-spawned
            // launcher and Task Scheduler's one-minute recovery trigger.
            if (TryStartScheduledServerTask())
            {
                for (var attempt = 0; attempt < 24; attempt += 1)
                {
                    await Task.Delay(250);
                    if (await IsHealthyAsync())
                    {
                        return;
                    }
                }
            }

            var runner = Path.Combine(serverRoot, "Esegui FLBP Server in background.ps1");
            if (!File.Exists(runner))
            {
                throw new FileNotFoundException("Manca il programma di avvio del server locale.", runner);
            }

            var startInfo = new ProcessStartInfo();
            startInfo.FileName = "powershell.exe";
            startInfo.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + runner + "\"";
            startInfo.WorkingDirectory = serverRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(startInfo);

            for (var attempt = 0; attempt < 40; attempt += 1)
            {
                await Task.Delay(250);
                if (await IsHealthyAsync())
                {
                    return;
                }
            }

            throw new InvalidOperationException(
                "Il server non e partito entro il tempo previsto. Controlla logs\\server.log.");
        }

        private static bool TryStartScheduledServerTask()
        {
            try
            {
                var startInfo = new ProcessStartInfo();
                startInfo.FileName = "schtasks.exe";
                startInfo.Arguments = "/Run /TN \"FLBP Server Locale\"";
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = true;
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;
                using (var process = Process.Start(startInfo))
                {
                    return process != null && process.WaitForExit(5000) && process.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private static Task<bool> IsHealthyAsync()
        {
            return Task.Run(delegate
            {
                try
                {
                    var request = (HttpWebRequest)WebRequest.Create(HealthUrl);
                    request.Method = "GET";
                    request.Timeout = 1200;
                    request.ReadWriteTimeout = 1200;
                    request.Proxy = null;
                    using (var response = (HttpWebResponse)request.GetResponse())
                    {
                        return response.StatusCode == HttpStatusCode.OK;
                    }
                }
                catch
                {
                    return false;
                }
            });
        }

        private static string FindServerRoot()
        {
            var directory = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            for (var level = 0; directory != null && level < 6; level += 1)
            {
                if (File.Exists(Path.Combine(directory.FullName, "src", "server.mjs")) &&
                    File.Exists(Path.Combine(directory.FullName, "Esegui FLBP Server in background.ps1")))
                {
                    return directory.FullName;
                }

                directory = directory.Parent;
            }

            return null;
        }
    }

    internal sealed class ProjectionForm : Form
    {
        private const int FullscreenHotKeyId = 0x4F11;
        private const int WindowsMessageHotKey = 0x0312;
        private const uint NoRepeatHotKey = 0x4000;
        private const uint VirtualKeyF11 = 0x7A;

        private readonly WebView2 browser;
        private readonly CoreWebView2Environment environment;
        private Rectangle windowedBounds;
        private FormBorderStyle windowedBorderStyle;
        private FormWindowState windowedState;
        private bool windowedTopMost;
        private bool fullscreen;
        private bool fullscreenHotKeyWanted;
        private bool fullscreenHotKeyRegistered;
        private DateTime lastFullscreenToggleUtc;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr windowHandle, int id, uint modifiers, uint virtualKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr windowHandle, int id);

        public ProjectionForm(CoreWebView2Environment environment)
        {
            if (environment == null)
            {
                throw new ArgumentNullException("environment");
            }

            this.environment = environment;

            Text = "FLBP Proiezione - F11: schermo intero";
            StartPosition = FormStartPosition.CenterParent;
            Width = 1280;
            Height = 720;
            MinimumSize = new Size(640, 480);
            BackColor = Color.Black;
            KeyPreview = true;

            browser = new WebView2();
            browser.Dock = DockStyle.Fill;
            browser.DefaultBackgroundColor = Color.Black;
            Controls.Add(browser);
        }

        public CoreWebView2 WebView
        {
            get { return browser.CoreWebView2; }
        }

        public async Task PrepareForNewWindowAsync()
        {
            await browser.EnsureCoreWebView2Async(environment);

            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.IsZoomControlEnabled = true;

            // A projection window must never look like the Admin writer. The
            // separate marker lets the web UI offer projection-only affordances
            // without granting the native writer identity to this window.
            await browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "Object.defineProperty(window,'__FLBP_NATIVE_PROJECTION_WINDOW'," +
                "{value:true,configurable:false,enumerable:false,writable:false});");

            browser.CoreWebView2.WindowCloseRequested += delegate
            {
                if (!IsDisposed)
                {
                    BeginInvoke(new MethodInvoker(Close));
                }
            };
            browser.CoreWebView2.DocumentTitleChanged += delegate
            {
                var title = browser.CoreWebView2.DocumentTitle;
                Text = string.IsNullOrWhiteSpace(title)
                    ? "FLBP Proiezione - F11: schermo intero"
                    : title + " - F11: schermo intero";
            };
        }

        protected override void OnActivated(EventArgs args)
        {
            base.OnActivated(args);
            fullscreenHotKeyWanted = true;
            RegisterFullscreenHotKey();
        }

        protected override void OnDeactivate(EventArgs args)
        {
            fullscreenHotKeyWanted = false;
            UnregisterFullscreenHotKey();
            base.OnDeactivate(args);
        }

        protected override void OnHandleCreated(EventArgs args)
        {
            base.OnHandleCreated(args);
            if (fullscreenHotKeyWanted)
            {
                RegisterFullscreenHotKey();
            }
        }

        protected override void OnHandleDestroyed(EventArgs args)
        {
            // Changing FormBorderStyle may recreate the native HWND. Release
            // the registration tied to the old handle; OnHandleCreated will
            // attach it again while this remains the active projection.
            UnregisterFullscreenHotKey();
            base.OnHandleDestroyed(args);
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            var keyCode = keyData & Keys.KeyCode;
            if (keyCode == Keys.F11)
            {
                ToggleFullscreen();
                return true;
            }

            if (keyCode == Keys.Escape && fullscreen)
            {
                ExitFullscreen();
                return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void OnFormClosed(FormClosedEventArgs args)
        {
            UnregisterFullscreenHotKey();
            base.OnFormClosed(args);
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == WindowsMessageHotKey && message.WParam.ToInt32() == FullscreenHotKeyId)
            {
                ToggleFullscreen();
                return;
            }

            base.WndProc(ref message);
        }

        private void RegisterFullscreenHotKey()
        {
            if (fullscreenHotKeyRegistered || !IsHandleCreated)
            {
                return;
            }

            // RegisterHotKey routes F11 to the native top-level window even
            // while Chromium owns keyboard focus inside the WebView2 child HWND.
            fullscreenHotKeyRegistered = RegisterHotKey(
                Handle,
                FullscreenHotKeyId,
                NoRepeatHotKey,
                VirtualKeyF11);
            if (!fullscreenHotKeyRegistered)
            {
                AppLog.Write("Impossibile registrare F11 per la finestra di proiezione. Codice Win32: " +
                    Marshal.GetLastWin32Error());
            }
        }

        private void UnregisterFullscreenHotKey()
        {
            if (!fullscreenHotKeyRegistered || !IsHandleCreated)
            {
                return;
            }

            UnregisterHotKey(Handle, FullscreenHotKeyId);
            fullscreenHotKeyRegistered = false;
        }

        private void ToggleFullscreen()
        {
            // ProcessCmdKey is a fallback if Windows cannot reserve the hotkey.
            // Debounce protects against the same key reaching both paths.
            var now = DateTime.UtcNow;
            if ((now - lastFullscreenToggleUtc).TotalMilliseconds < 250)
            {
                return;
            }
            lastFullscreenToggleUtc = now;

            if (fullscreen)
            {
                ExitFullscreen();
                return;
            }

            var targetScreen = Screen.FromControl(this);
            windowedBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            windowedBorderStyle = FormBorderStyle;
            windowedState = WindowState;
            windowedTopMost = TopMost;

            SuspendLayout();
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            TopMost = true;
            Bounds = targetScreen.Bounds;
            fullscreen = true;
            ResumeLayout(true);
            browser.Focus();
        }

        private void ExitFullscreen()
        {
            if (!fullscreen)
            {
                return;
            }

            SuspendLayout();
            TopMost = windowedTopMost;
            FormBorderStyle = windowedBorderStyle;
            WindowState = FormWindowState.Normal;
            Bounds = windowedBounds;
            if (windowedState == FormWindowState.Maximized)
            {
                WindowState = FormWindowState.Maximized;
            }
            fullscreen = false;
            ResumeLayout(true);
            browser.Focus();
        }
    }

    internal static class AppLog
    {
        public static string ServerRoot;

        public static void Write(Exception exception)
        {
            Write(exception == null ? "Errore sconosciuto." : exception.ToString());
        }

        public static void Write(string message)
        {
            try
            {
                var root = string.IsNullOrEmpty(ServerRoot)
                    ? AppDomain.CurrentDomain.BaseDirectory
                    : ServerRoot;
                var logs = Path.Combine(root, "logs");
                Directory.CreateDirectory(logs);
                File.AppendAllText(
                    Path.Combine(logs, "windows-app.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine + Environment.NewLine);
            }
            catch
            {
            }
        }
    }
}

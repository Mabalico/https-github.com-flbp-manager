using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
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
        [STAThread]
        private static void Main()
        {
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
        private bool initializing;

        public MainForm()
        {
            serverRoot = FindServerRoot();
            nativeWriterWindowId = Guid.NewGuid().ToString("N");
            AppLog.ServerRoot = serverRoot;

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
                    var environment = await CoreWebView2Environment.CreateAsync(null, userData);
                    await browser.EnsureCoreWebView2Async(environment);
                    await ConfigureBrowserAsync();
                }

                browser.CoreWebView2.Navigate(PanelUrl);
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

            browser.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
            {
                if (args.IsSuccess)
                {
                    overlay.Visible = false;
                    browser.Focus();
                }
                else
                {
                    overlay.Visible = true;
                    overlay.BringToFront();
                    statusLabel.Text = "La pagina locale non ha risposto.\n\nCodice: " + args.WebErrorStatus;
                    retryButton.Visible = true;
                    retryButton.BringToFront();
                }
            };

            browser.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args)
            {
                args.Handled = true;
                if (IsLocalUri(args.Uri))
                {
                    browser.CoreWebView2.Navigate(args.Uri);
                }
                else
                {
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
            };
        }

        private void Navigate(string url)
        {
            if (browser.CoreWebView2 == null)
            {
                BeginInitialization();
                return;
            }

            browser.CoreWebView2.Navigate(url);
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

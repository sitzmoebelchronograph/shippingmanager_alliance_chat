using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Threading;

namespace ShippingManagerCoPilot.Installer.Logic
{
    /// <summary>
    /// Main installer logic class
    /// </summary>
    public class Installer
    {
        private readonly string _installPath;
        private readonly bool _createDesktopShortcut;
        private readonly bool _createStartMenuShortcut;
        private readonly bool _isUpdate;

        // Events for UI updates
        public event Action<int, string> ProgressChanged;
        public event Action<string> StatusChanged;

        public Installer(string installPath, bool createDesktopShortcut, bool createStartMenuShortcut, bool isUpdate = false)
        {
            _installPath = installPath;
            _createDesktopShortcut = createDesktopShortcut;
            _createStartMenuShortcut = createStartMenuShortcut;
            _isUpdate = isUpdate;
        }

        /// <summary>
        /// Executes the installation process
        /// </summary>
        public void Install()
        {
            try
            {
                // Step 1: Check if already installed
                UpdateStatus(_isUpdate ? "Checking update requirements..." : "Checking installation status...");
                UpdateProgress(5, _isUpdate ? "Preparing update" : "Checking existing installation");

                if (RegistryHelper.IsInstalled() && !_isUpdate)
                {
                    var existingPath = RegistryHelper.GetInstallPath();
                    throw new Exception($"ShippingManager CoPilot is already installed at:\n{existingPath}\n\nPlease uninstall the existing version first.");
                }

                // If updating, stop the running application
                if (_isUpdate)
                {
                    UpdateStatus("Stopping running application...");
                    UpdateProgress(8, "Stopping application");
                    StopRunningApplication();
                    Thread.Sleep(1000);
                }

                // Step 2: Create installation directory
                UpdateStatus("Creating installation directory...");
                UpdateProgress(10, "Creating installation directory");

                if (!Directory.Exists(_installPath))
                {
                    Directory.CreateDirectory(_installPath);
                }

                // Step 3: Extract embedded payload
                UpdateStatus("Extracting application files...");
                UpdateProgress(20, "Extracting application files");

                ExtractEmbeddedPayload();

                UpdateProgress(50, "Application files extracted successfully");

                // Step 4: Create uninstaller
                UpdateStatus("Creating uninstaller...");
                UpdateProgress(60, "Creating uninstaller");

                CreateUninstaller();

                // Step 5: Create shortcuts
                if (_createDesktopShortcut || _createStartMenuShortcut)
                {
                    UpdateStatus("Creating shortcuts...");
                    UpdateProgress(70, "Creating shortcuts");

                    CreateShortcuts();
                }

                // Step 6: Register in Windows
                UpdateStatus("Registering application...");
                UpdateProgress(85, "Registering in Windows");

                var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";
                RegistryHelper.RegisterUninstallEntry(_installPath, version);

                // Step 7: Complete
                UpdateStatus("Installation complete!");
                UpdateProgress(100, "Installation completed successfully");
            }
            catch (Exception ex)
            {
                throw new Exception($"Installation failed: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Extracts the embedded app-payload.zip to installation directory
        /// </summary>
        private void ExtractEmbeddedPayload()
        {
            var assembly = Assembly.GetExecutingAssembly();
            var resourceName = assembly.GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith("app-payload.zip"));

            if (string.IsNullOrEmpty(resourceName))
            {
                throw new Exception("Application payload not found in installer. The installer may be corrupted.");
            }

            using (var stream = assembly.GetManifestResourceStream(resourceName))
            {
                if (stream == null)
                {
                    throw new Exception("Failed to read application payload from installer.");
                }

                // Extract to temp location first
                var tempZipPath = Path.Combine(Path.GetTempPath(), "shippingmanager_payload.zip");

                try
                {
                    // Save stream to temp file
                    using (var fileStream = File.Create(tempZipPath))
                    {
                        stream.CopyTo(fileStream);
                    }

                    // Extract zip to installation directory
                    ZipFile.ExtractToDirectory(tempZipPath, _installPath, overwriteFiles: true);
                }
                finally
                {
                    // Clean up temp file
                    if (File.Exists(tempZipPath))
                    {
                        File.Delete(tempZipPath);
                    }
                }
            }
        }

        /// <summary>
        /// Creates the uninstaller executable
        /// </summary>
        private void CreateUninstaller()
        {
            // Use AppContext.BaseDirectory instead of Assembly.Location for single-file apps
            var installerDir = AppContext.BaseDirectory;
            var uninstallerDir = Path.Combine(_installPath, "Uninstaller");

            // Create uninstaller directory
            Directory.CreateDirectory(uninstallerDir);

            // Copy all installer files (exe + DLLs) to uninstaller directory
            foreach (var file in Directory.GetFiles(installerDir))
            {
                var fileName = Path.GetFileName(file);
                var destFile = Path.Combine(uninstallerDir, fileName);

                // Rename main exe to Uninstall.exe
                if (fileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(file, Path.Combine(uninstallerDir, "Uninstall.exe"), overwrite: true);
                }
                else
                {
                    File.Copy(file, destFile, overwrite: true);
                }
            }
        }

        /// <summary>
        /// Creates desktop and start menu shortcuts
        /// </summary>
        private void CreateShortcuts()
        {
            var exePath = Path.Combine(_installPath, "ShippingManagerCoPilot.exe");

            if (!File.Exists(exePath))
            {
                throw new Exception($"Application executable not found at: {exePath}");
            }

            if (_createDesktopShortcut)
            {
                ShortcutHelper.CreateDesktopShortcut(
                    exePath,
                    "ShippingManager CoPilot",
                    "ShippingManager CoPilot - Chat and automation tool for Shipping Manager"
                );
            }

            if (_createStartMenuShortcut)
            {
                ShortcutHelper.CreateStartMenuShortcut(
                    exePath,
                    "ShippingManager CoPilot",
                    "ShippingManager CoPilot - Chat and automation tool for Shipping Manager"
                );
            }
        }

        /// <summary>
        /// Updates installation progress
        /// </summary>
        private void UpdateProgress(int percentage, string message)
        {
            ProgressChanged?.Invoke(percentage, message);
        }

        /// <summary>
        /// Updates installation status
        /// </summary>
        private void UpdateStatus(string status)
        {
            StatusChanged?.Invoke(status);
        }

        /// <summary>
        /// Stop the running ShippingManagerCoPilot application if it's running
        /// </summary>
        private void StopRunningApplication()
        {
            try
            {
                // Find all processes named ShippingManagerCoPilot
                var processes = Process.GetProcessesByName("ShippingManagerCoPilot");

                foreach (var process in processes)
                {
                    try
                    {
                        // Try graceful shutdown first
                        process.CloseMainWindow();

                        // Wait up to 3 seconds for graceful shutdown
                        if (!process.WaitForExit(3000))
                        {
                            // Force kill if still running
                            process.Kill();
                            process.WaitForExit();
                        }
                    }
                    catch
                    {
                        // Ignore errors for individual processes
                    }
                }
            }
            catch
            {
                // Don't fail update if we can't stop the app
            }
        }
    }
}

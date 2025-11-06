using System;
using System.IO;
using System.Threading;
using System.Diagnostics;
using System.Linq;

namespace ShippingManagerCoPilot.Installer.Logic
{
    /// <summary>
    /// Handles application uninstallation
    /// </summary>
    public class Uninstaller
    {
        private readonly string _installPath;
        private readonly bool _keepPersonalData;

        // Events for UI updates
        public event Action<int, string> ProgressChanged;
        public event Action<string> StatusChanged;
        public event Action<int> TaskCompleted;

        public Uninstaller(string installPath, bool keepPersonalData)
        {
            _installPath = installPath;
            _keepPersonalData = keepPersonalData;
        }

        /// <summary>
        /// Executes the uninstallation process
        /// </summary>
        public void Uninstall()
        {
            try
            {
                // Step 1: Stop running application
                UpdateStatus("Stopping running application...");
                UpdateProgress(5, "Stopping application");

                StopRunningApplication();

                Thread.Sleep(1000);
                UpdateProgress(15, "Application stopped");

                // Step 2: Remove shortcuts
                UpdateStatus("Removing shortcuts...");
                UpdateProgress(20, "Removing shortcuts");

                ShortcutHelper.RemoveDesktopShortcut("ShippingManager CoPilot");
                ShortcutHelper.RemoveStartMenuShortcuts();

                Thread.Sleep(500);
                UpdateProgress(35, "Shortcuts removed");
                TaskCompleted?.Invoke(1);

                // Step 3: Remove program files
                UpdateStatus("Removing program files...");
                UpdateProgress(40, "Removing program files");

                if (Directory.Exists(_installPath))
                {
                    try
                    {
                        // Delete all files except the uninstaller itself
                        var uninstallerPath = Path.Combine(_installPath, "Uninstall.exe");

                        foreach (var file in Directory.GetFiles(_installPath, "*", SearchOption.AllDirectories))
                        {
                            if (!file.Equals(uninstallerPath, StringComparison.OrdinalIgnoreCase))
                            {
                                try
                                {
                                    File.Delete(file);
                                }
                                catch
                                {
                                    // Ignore files that can't be deleted
                                }
                            }
                        }

                        // Delete subdirectories
                        foreach (var dir in Directory.GetDirectories(_installPath))
                        {
                            // Skip user data directories if user wants to keep personal data
                            if (_keepPersonalData)
                            {
                                var dirName = Path.GetFileName(dir).ToLowerInvariant();
                                if (dirName == "data" || dirName == "settings" || dirName == "logs" || dirName == "certs")
                                {
                                    continue; // Skip this directory
                                }
                            }

                            try
                            {
                                Directory.Delete(dir, true);
                            }
                            catch
                            {
                                // Ignore directories that can't be deleted
                            }
                        }

                        // Schedule uninstaller deletion and directory cleanup
                        ScheduleUninstallerDeletion(_installPath);
                    }
                    catch (Exception ex)
                    {
                        throw new Exception($"Failed to remove program files: {ex.Message}", ex);
                    }
                }

                UpdateProgress(60, "Program files removed");
                TaskCompleted?.Invoke(2);

                // Step 3: Remove personal data if requested
                if (!_keepPersonalData)
                {
                    UpdateStatus("Removing personal data...");
                    UpdateProgress(70, "Removing personal data");

                    var appDataPath = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "ShippingManagerCoPilot");

                    if (Directory.Exists(appDataPath))
                    {
                        try
                        {
                            Directory.Delete(appDataPath, true);
                        }
                        catch (Exception ex)
                        {
                            throw new Exception($"Failed to remove personal data: {ex.Message}", ex);
                        }
                    }
                }

                // Step 4: Remove registry entries
                UpdateStatus("Removing registry entries...");
                UpdateProgress(80, "Removing registry entries");

                RegistryHelper.RemoveUninstallEntry();

                Thread.Sleep(500);
                UpdateProgress(100, "Registry entries removed");
                TaskCompleted?.Invoke(3);

                UpdateStatus("Uninstallation complete!");
            }
            catch (Exception ex)
            {
                throw new Exception($"Uninstallation failed: {ex.Message}", ex);
            }
        }

        private void UpdateProgress(int percentage, string message)
        {
            ProgressChanged?.Invoke(percentage, message);
        }

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
                // Don't fail uninstall if we can't stop the app
            }
        }

        /// <summary>
        /// Schedules the uninstaller to be deleted on next reboot
        /// </summary>
        private static void ScheduleUninstallerDeletion(string installPath)
        {
            try
            {
                // Create a batch file to delete the uninstaller and folder
                var batchPath = Path.Combine(Path.GetTempPath(), "shippingmanager_cleanup.bat");
                var batchContent = $@"@echo off
timeout /t 2 /nobreak > nul
rd /s /q ""{installPath}""
del ""%~f0""
";

                File.WriteAllText(batchPath, batchContent);

                // Start the batch file in hidden mode
                var processInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = batchPath,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                };

                System.Diagnostics.Process.Start(processInfo);
            }
            catch
            {
                // If scheduling fails, just leave the uninstaller and let user delete manually
            }
        }
    }
}

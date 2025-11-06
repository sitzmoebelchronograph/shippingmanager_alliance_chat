using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace ShippingManagerCoPilot.Installer.Pages.Uninstall
{
    public partial class UninstallCompletePage : Page
    {
        private readonly UninstallWindow _mainWindow;
        private readonly bool _keptPersonalData;

        public UninstallCompletePage(UninstallWindow mainWindow, bool keptPersonalData)
        {
            InitializeComponent();
            _mainWindow = mainWindow;
            _keptPersonalData = keptPersonalData;

            // Show personal data info if data was kept
            if (_keptPersonalData)
            {
                DataKeptInfo.Visibility = Visibility.Visible;
                var appDataPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ShippingManagerCoPilot");
                DataPathText.Text = appDataPath;
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }
    }
}

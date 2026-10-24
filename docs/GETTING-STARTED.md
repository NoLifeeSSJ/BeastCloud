# Create your account and open BeastCloud

The main BeastCloud interface opens in a browser. An automatically started Windows service stores and serves your cloud on this computer. Closing the browser leaves that service running. The optional selected-folder sync companion is a separate Windows console program; there is no separate native graphical desktop client in this version.

## Copy the local setup key

`setup.key` is plain text. Windows may label it a Keynote file because of the `.key` extension. The application association does not change its contents. Its folder is protected, so use an administrator PowerShell window to read it.

1. On the computer where BeastCloud was installed, right-click PowerShell and choose **Run as administrator**. Accept the Windows prompt.
2. Paste this command. It copies the key and prints a confirmation without displaying the key:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Clipboard -Value ((Get-Content -LiteralPath 'C:\BeastCloud\config\setup.key' -Raw).Trim())
    Write-Host 'Setup key copied. Paste it into the Local setup key box in BeastCloud.'
}
```

3. Open `https://localhost:5443` on this same computer. In **Local setup key**, press **Ctrl+V**.
4. Choose your **Account name** and a password of at least **12 characters**. Click **Create my private cloud**.
5. Save the recovery codes outside BeastCloud. Each code can be used once to recover your account. Click **I saved my codes · Open BeastCloud**.

Keep the setup key private and enter it only into your local setup page. After the owner is created, BeastCloud deletes `setup.key`. Future visits use your account name and password; the setup key is not your sign-in password. If you already see the sign-in screen, use that existing account instead of looking for another setup key.

The paths and address above are the installation defaults. If you deliberately installed to another root or port, use that root and port.

## Create a desktop icon now

Open PowerShell as your usual Windows user; administrator access is unnecessary. Paste:

```powershell
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
Set-Content -LiteralPath (Join-Path $desktop 'BeastCloud.url') -Encoding ASCII -Value "[InternetShortcut]`r`nURL=https://localhost:5443"
Write-Host 'BeastCloud desktop shortcut created.'
```

Double-click **BeastCloud** on your desktop. It opens the application in your default browser. Windows uses your actual desktop location, including a desktop redirected to OneDrive. This creates a shortcut to the existing installation and does not reinstall the server.

The source also includes `scripts/New-BeastCloudShortcut.ps1` for the same task. Run it from a source checkout or a fresh package; `-Port` supports a deliberately chosen nondefault port. `-DesktopDirectory` can specify an existing desktop directory if Windows cannot locate it. Older immutable installer packages do not contain the new helper, so the commands above work with those installations too.

## Everyday use

- Open the desktop icon or visit `https://localhost:5443`; sign in with your account.
- Use **Files** to upload files and create folders. Use the notes, tasks and calendar views for their respective records. Uploads and records are stored on this PC.
- Closing the browser leaves the background service running. Keep the browser open until a browser upload finishes.
- The service starts automatically with Windows. This computer must be powered on and awake to serve files or accept sync transfers.
- By default, access is limited to this computer. Other computers and phones need deliberate network/certificate configuration in [NETWORK.md](NETWORK.md); GitHub supplies the software, not your running storage.
- Browser uploads do not automatically watch your Windows folders. The optional [Windows sync companion](SYNC.md) syncs only an explicitly selected folder after pairing.
- Use Settings and [RECOVERY.md](RECOVERY.md) to arrange backups on another owned drive. The default backup folder is on the same PC.

If the page cannot connect, run `Get-Service BeastCloud` in PowerShell. If its status is **Stopped**, open PowerShell as administrator and run `Start-Service BeastCloud`, then reopen the desktop icon. This is separate from account setup; it does not require a new key or a new account.

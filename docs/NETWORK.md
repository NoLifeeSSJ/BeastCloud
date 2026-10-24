# Network and certificate guide

Default: loopback-only HTTPS at https://localhost:5443. There is no HTTP production endpoint, port forwarding, UPnP, external relay, hosted tunnel, automatic firewall exception, domain requirement, update checker or application telemetry. All core assets are local. Browser security headers disallow third-party assets/connections. The server makes no runtime HTTP calls to providers. The companion talks only to its configured owned server.

## Certificates

Installation creates a unique RSA-3072, two-year self-signed service TLS certificate with localhost, machine DNS name and loopback IP SANs. This is a production installation certificate, not `dotnet dev-certs`. Its PFX and password-bearing configuration are restricted to SYSTEM, Administrators and the virtual service identity. The public `.cer` is imported into LocalMachine\Root on the installation computer. The temporary private-key store entry is removed after PFX export.

Keep track of its thumbprint in config\installation.json. To remove its trust after uninstall, match that exact thumbprint in `Cert:\LocalMachine\Root`; do not delete other roots. To renew, stop BeastCloud, generate a replacement with `New-SelfSignedCertificate` using the same SANs, export it to a new PFX with a new random password, update each endpoint's certificate Path/Password in config\server.json, trust only the new public certificate on owned devices, restart, and verify HTTPS without bypasses. Remove the old root once clients migrate. Back up before renewal. There is no automated renewal wizard in 0.1.0.

## Explicit LAN mode

At first installation only, select the server's stable private IPv4 address:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install.ps1 -Lan -LanAddress 192.168.1.50
```

This example address must be replaced by the actual private address on your server. The installer binds loopback plus that one private address, includes it in the certificate SANs and still creates **no firewall rule**. Setup remains accessible only from loopback. To allow owned LAN devices, explicitly add a private-profile, LocalSubnet-only rule in elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName 'BeastCloud private LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 192.168.1.50 -LocalPort 5443 -RemoteAddress LocalSubnet -Profile Private
```

Copy config\beastcloud.cer over a trusted owned medium to each client, independently compare its thumbprint with the server, and trust that specific certificate on that device. On Windows: `Import-Certificate -FilePath .\beastcloud.cer -CertStoreLocation Cert:\CurrentUser\Root`. Use https://192.168.1.50:5443 only after trust is installed. Never ignore TLS errors or disable certificate validation. Browser trust is not account authorization: each account/device/share still needs a grant.

Changing an existing loopback installation to LAN is a deliberate local maintenance operation: back up and stop the service, issue a replacement certificate containing the actual private IP, add a `Lan` endpoint in config\server.json using that IP and certificate, record the chosen mode in installation.json, update trust, restart and test before adding the restricted firewall rule. Rerunning the installer refuses a silent change to storage, port or scope. Do not enable LAN by editing the app into Development mode.

## Optional remote access you control

Run WireGuard on your own router/server and connect your client devices to your private LAN or a deliberately configured VPN address. Configure routes and firewall rules yourself, and issue a service certificate covering the actual address clients will use. BeastCloud neither configures this network nor forwards ports. This needs suitable inbound connectivity and an awake server; CGNAT may prevent direct reachability without additional infrastructure you control. No mandatory hosted control plane is introduced. A share link can only work where the recipient can reach and trust your server.

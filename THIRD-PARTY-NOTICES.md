# Third-party notices and build provenance

BeastCloud uses open-source dependencies downloaded at development/build time from official NuGet and npm registries and official .NET/PowerShell/browser release sources. Installed core operation makes no dependency-download requests. Full resolved versions and integrity hashes are in `packages.lock.json` and `package-lock.json`.

* .NET / ASP.NET Core / Microsoft.Extensions / Microsoft.Data.Sqlite / System.Security.Cryptography.ProtectedData: Microsoft, MIT. Self-contained runtime carries Microsoft's third-party notice files.
* SQLite: public domain; SQLitePCLRaw interop and native bundles: Eric Sink and contributors, Apache-2.0 / public-domain SQLite, with notices in their packages.
* SkiaSharp and native assets: Microsoft and contributors, MIT; Skia and bundled codecs carry their upstream third-party licenses. No SixLabors library or license activation is included.
* React / React DOM / scheduler: Meta and contributors, MIT.
* lucide-react: Lucide contributors, ISC (some inherited Feather artwork MIT).
* Vite, TypeScript, React build plugin, Vitest, Playwright, Prettier and transitive build/test packages: upstream licenses, detailed in their locked npm metadata and source packages. They are not required by the installed application runtime.
* Test-only xUnit and Microsoft.NET.Test.Sdk follow their upstream licenses and are not distributed as application dependencies.

The package's `docs/third-party-licenses` directory contains cached upstream license/notice files and a resolved runtime dependency inventory generated from the lockfiles and installed packages. This is provided for attribution; upstream license terms govern redistribution. No signing certificate, paid dependency, API key or hosted activation is fabricated or required.

Cloud verification downloaded .NET SDK 10.0.402 from builds.dotnet.microsoft.com; PowerShell 7.5.4 from the official PowerShell GitHub release (verified against its published SHA256); and Chrome 156.0.8078.47 from dl.google.com (verified against official package metadata). Chrome and PowerShell were verification tools and are not included in the Windows release ZIP. The installed product does not use those test tools or make their update/network claims.

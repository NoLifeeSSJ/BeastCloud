using BeastCloud;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using System.Text.Json;
using Microsoft.Data.Sqlite;
if (args.Length > 0 && args[0].StartsWith("--"))
{
    try
    {
        switch (args[0])
        {
            case "--verify-backup": await Backup.Verify(args[1]); Console.WriteLine("Backup integrity: OK"); return;
            case "--restore": await Backup.Restore(args[1], Path.GetFullPath(args[2])); return;
            case "--encrypt-backup": case "--decrypt-backup": Console.Write("Backup passphrase (input is hidden in an interactive terminal): "); string password = ""; if (Console.IsInputRedirected) password = Console.ReadLine() ?? ""; else { ConsoleKeyInfo key; while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter) { if (key.Key == ConsoleKey.Backspace) { if (password.Length > 0) password = password[..^1]; } else password += key.KeyChar; } Console.WriteLine(); } if (args[0] == "--encrypt-backup") { await Backup.Verify(args[1]); BackupCrypto.Encrypt(args[1], args[2], password); } else { BackupCrypto.Decrypt(args[1], args[2], password); await Backup.Verify(args[2]); } return;
        }
    }
    catch (Exception e) { Console.Error.WriteLine(e.Message); Environment.ExitCode = 1; return; }
}
var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(o => o.ServiceName = "BeastCloud");
var root = Environment.GetEnvironmentVariable("BEAST_ROOT") ?? Path.Combine(AppContext.BaseDirectory, "..", "..");
var storageConfig = Path.Combine(root, "config", "storage.json");
var files = File.Exists(storageConfig) ? JsonDocument.Parse(File.ReadAllText(storageConfig)).RootElement.GetProperty("files").GetString() : Environment.GetEnvironmentVariable("BEAST_FILES");
Directory.CreateDirectory(Path.Combine(root, "config"));
using var instanceLock = new FileStream(Path.Combine(root, "config", "instance.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
var store = new Storage(root, files);
var db = new Database(Path.Combine(store.Data, "db", "beast.db")); db.Initialize();
if (args.FirstOrDefault() == "--backup") { try { var backup = await Backup.Create(db, store); await Backup.Verify(backup); Console.WriteLine(backup); } catch (Exception e) { Console.Error.WriteLine(e.Message); Environment.ExitCode = 1; } return; }
var localConfig = Path.Combine(root, "config", "server.json"); if (File.Exists(localConfig)) builder.Configuration.AddJsonFile(localConfig, false, false);

if (db.Scalar("SELECT id FROM users LIMIT 1") == null && !File.Exists(Path.Combine(root, "config", "setup.key"))) File.WriteAllText(Path.Combine(root, "config", "setup.key"), Storage.Token());
builder.Logging.AddProvider(new LocalLog(Path.Combine(root, "logs")));
builder.Services.AddSingleton(store); builder.Services.AddSingleton(db); builder.Services.AddSingleton<Security>(); builder.Services.AddSingleton<Cloud>(); builder.Services.AddHostedService<Worker>();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(o => o.SerializerOptions.PropertyNameCaseInsensitive = true);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 8 * 1024 * 1024);
builder.Services.AddRateLimiter(o => { o.RejectionStatusCode = 429; o.AddPolicy("auth", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new() { PermitLimit = 12, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
var app = builder.Build();
app.Use(async (c, next) =>
{
    c.Response.Headers["X-Content-Type-Options"] = "nosniff"; c.Response.Headers["Referrer-Policy"] = "no-referrer"; c.Response.Headers["X-Frame-Options"] = "DENY";
    c.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
    if (c.Request.IsHttps) c.Response.Headers["Strict-Transport-Security"] = "max-age=31536000";
    if (!app.Environment.IsDevelopment() && !c.Request.IsHttps) { c.Response.StatusCode = 400; await c.Response.WriteAsJsonAsync(new { error = "HTTPS is required" }); return; }
    if (c.Request.Path.StartsWithSegments("/api")) c.Response.Headers.CacheControl = "no-store";
    try { await next(); } catch (Exception e) when (e is ArgumentException or InvalidOperationException or IOException or SqliteException or JsonException or TimeZoneNotFoundException or InvalidTimeZoneException or UnauthorizedAccessException) { c.Response.StatusCode = e switch { ArgumentException or TimeZoneNotFoundException or InvalidTimeZoneException => 400, SqliteException s when s.SqliteErrorCode == 19 => 409, InvalidOperationException => 409, _ => 503 }; await c.Response.WriteAsJsonAsync(new { error = e is SqliteException ? "A conflicting record exists or the database operation failed." : e.Message }); }
});
app.UseRateLimiter();
app.Use(async (c, next) =>
{
    var p = c.Request.Path.Value ?? "";
    if (!p.StartsWith("/api/") || p is "/api/health" or "/api/bootstrap" or "/api/setup" or "/api/login" or "/api/recover" or "/api/pair" || p.StartsWith("/api/public/")) { await next(); return; }
    if (p.StartsWith("/api/sync/")) { var token = c.Request.Headers.Authorization.ToString(); var d = db.Rows("SELECT * FROM devices WHERE token=$h AND paused=0", ("$h", Storage.Hash(token.Replace("Bearer ", "")))).FirstOrDefault(); if (d == null) { c.Response.StatusCode = 401; return; } c.Items["device"] = d; db.Execute("UPDATE devices SET lastSeen=$n WHERE id=$id", ("$n", Database.Now), ("$id", d["id"])); await next(); return; }
    var sec = c.RequestServices.GetRequiredService<Security>(); var u = sec.User(c); if (u == null) { c.Response.StatusCode = 401; return; }
    c.Items["user"] = u;
    if (c.Request.Method is not ("GET" or "HEAD") && c.Request.Headers["X-CSRF"] != (string)u["csrf"]!) { c.Response.StatusCode = 403; return; }
    if ((string)u["role"] != "owner" && p is not "/api/session" and not "/api/logout" && !p.StartsWith("/api/shared")) { c.Response.StatusCode = 403; return; }
    await next();
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/health", () => new { status = "ready", version = "0.1.0" });
Cloud.Map(app);
app.MapFallbackToFile("index.html");
app.Run();

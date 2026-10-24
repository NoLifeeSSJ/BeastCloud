using Xunit;
using BeastCloud;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Security.Cryptography;
public sealed class CoreTests : IDisposable
{
    readonly string temp = Path.Combine(Path.GetTempPath(), "beast-unit-" + Guid.NewGuid());
    public CoreTests() { Directory.CreateDirectory(temp); }
    public void Dispose() { Directory.Delete(temp, true); }
    [Theory]
    [InlineData("CON.txt")]
    [InlineData("nul")]
    [InlineData("COM0.log")]
    [InlineData("../x")]
    [InlineData("C:x")]
    [InlineData("name.")]
    [InlineData("\\\\server\\file")]
    [InlineData("bad\nname")]
    public void RejectWindowsNames(string name) => Assert.Throws<ArgumentException>(() => Storage.Name(name));
    [Fact] public void MissingVolumeDoesNotRecreate() { var root = Path.Combine(temp, "root"); var s = new Storage(root, null); File.Delete(Path.Combine(s.Files, ".beastcloud-volume")); Assert.Throws<IOException>(() => new Storage(root, null)); Assert.False(File.Exists(Path.Combine(s.Files, ".beastcloud-volume"))); }
    [Fact] public void StorageRejectsSymlink() { if (OperatingSystem.IsWindows()) return; var real = Path.Combine(temp, "real"); Directory.CreateDirectory(real); var link = Path.Combine(temp, "link"); Directory.CreateSymbolicLink(link, real); Assert.Throws<IOException>(() => Storage.CheckPath(link)); }
    [Fact] public void RejectBackupInsideData() { var s = new Storage(Path.Combine(temp, "root"), null); Assert.Throws<ArgumentException>(() => Backup.ValidateDestination(s, Path.Combine(s.Files, "backups"))); }
    [Fact] public async Task RefuseNonemptyRestore() { Directory.CreateDirectory(Path.Combine(temp, "dest")); File.WriteAllText(Path.Combine(temp, "dest", "mine"), "preserve"); await Assert.ThrowsAsync<ArgumentException>(() => Backup.Restore("unused", Path.Combine(temp, "dest"))); Assert.Equal("preserve", File.ReadAllText(Path.Combine(temp, "dest", "mine"))); }
    [Fact] public void CalendarRoundTripAndUnsupportedRules() { var text = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Safe\\, local\r\nDTSTART:20260101T120000Z\r\nDTEND:20260101T130000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR"; var r = Calendar.Import(text); Assert.Single(r); Assert.Equal("Safe, local", r[0].title); Assert.Throws<ArgumentException>(() => Calendar.Import(text.Replace("COUNT=3", "BYDAY=MO"))); }
    [Fact] public void EncryptionRejectsTamperingAndWrongPassword() { var src = Path.Combine(temp, "src"); Directory.CreateDirectory(src); File.WriteAllText(Path.Combine(src, "data"), "secret backup contents"); var encrypted = Path.Combine(temp, "encrypted"); BackupCrypto.Encrypt(src, encrypted, "a secure test passphrase"); Assert.ThrowsAny<CryptographicException>(() => BackupCrypto.Decrypt(encrypted, Path.Combine(temp, "wrong"), "wrong password")); BackupCrypto.Decrypt(encrypted, Path.Combine(temp, "correct"), "a secure test passphrase"); Assert.Equal("secret backup contents", File.ReadAllText(Path.Combine(temp, "correct", "data"))); var bytes = File.ReadAllBytes(encrypted); bytes[^20] ^= 1; File.WriteAllBytes(encrypted, bytes); Assert.ThrowsAny<CryptographicException>(() => BackupCrypto.Decrypt(encrypted, Path.Combine(temp, "tamper"), "a secure test passphrase")); }
    [Fact] public async Task SyncUploadsAndRestartHasNoDuplicate() { var (c, server, profile) = Device(); await File.WriteAllTextAsync(Path.Combine(c.Folder, "hello.txt"), "hello"); using var http = new HttpClient(server) { BaseAddress = new Uri("https://local.invalid") }; await new Sync(http, profile, c).Reconcile(c); Assert.Single(server.Files); await new Sync(http, profile, c).Reconcile(c); Assert.Single(server.Files); Assert.Equal(1, server.Commits); }
    [Fact] public async Task SyncDownloadResumeAndConflictPreservesBoth() { var (c, server, profile) = Device(); server.Add("a.txt", "server edit"); await File.WriteAllTextAsync(Path.Combine(c.Folder, "a.txt"), "my local edit"); using var http = new HttpClient(server) { BaseAddress = new Uri("https://local.invalid") }; await new Sync(http, profile, c).Reconcile(c); Assert.Equal("server edit", File.ReadAllText(Path.Combine(c.Folder, "a.txt"))); Assert.Contains(Directory.GetFiles(c.Folder), p => p.Contains("conflict") && File.ReadAllText(p) == "my local edit"); Assert.Contains(server.Files.Values, f => System.Text.Encoding.UTF8.GetString(f.bytes) == "my local edit"); }
    [Fact] public async Task SyncMissingDriveNeverDeletes() { var (c, server, profile) = Device(); server.Add("a.txt", "server"); using var http = new HttpClient(server) { BaseAddress = new Uri("https://local.invalid") }; var sync = new Sync(http, profile, c); await sync.Reconcile(c); File.Delete(Path.Combine(c.Folder, ".beastcloud-volume")); c.PropagateDeletes = true; File.Delete(Path.Combine(c.Folder, "a.txt")); await Assert.ThrowsAsync<IOException>(() => sync.Reconcile(c)); Assert.Equal(0, server.Deletes); }
    [Fact] public async Task SyncExplicitDeletionUsesServerTrash() { var (c, server, profile) = Device(); server.Add("a.txt", "server"); using var http = new HttpClient(server) { BaseAddress = new Uri("https://local.invalid") }; var sync = new Sync(http, profile, c); await sync.Reconcile(c); c.PropagateDeletes = true; File.Delete(Path.Combine(c.Folder, "a.txt")); await sync.Reconcile(c); Assert.Equal(1, server.Deletes); Assert.NotNull(server.Files.Values.Single().r.deleted); }
    [Fact] public async Task SyncInterruptedUploadResumesAfterRestart() { var (c, server, profile) = Device(); var bytes = RandomNumberGenerator.GetBytes(5 * 1024 * 1024); await File.WriteAllBytesAsync(Path.Combine(c.Folder, "large.bin"), bytes); server.Interrupt = true; using var http = new HttpClient(server) { BaseAddress = new Uri("https://local.invalid") }; await Assert.ThrowsAsync<HttpRequestException>(() => new Sync(http, profile, c).Reconcile(c)); Assert.Equal(4194304, server.Offset); server.Interrupt = false; await new Sync(http, profile, c).Reconcile(c); Assert.Equal(bytes, server.Files.Values.Single().bytes); Assert.Equal(1, server.Commits); }
    (Config, FakeServer, string) Device() { var folder = Path.Combine(temp, "files"); var profile = Path.Combine(temp, "profile"); Directory.CreateDirectory(folder); Directory.CreateDirectory(profile); var c = new Config { Folder = folder, RemoteFolder = "root", Marker = "test" }; File.WriteAllText(Path.Combine(folder, ".beastcloud-volume"), c.Marker); return (c, new FakeServer(), profile); }
}
public sealed class FakeServer : HttpMessageHandler
{
    public Dictionary<string, (Remote r, byte[] bytes)> Files = new(); public int Commits, Deletes; public long Offset; public bool Interrupt; string name = "", parent = "root"; MemoryStream upload = new();
    static string Hash(byte[] b) => Convert.ToHexStringLower(SHA256.HashData(b));
    public void Add(string name, string content) { var id = Guid.NewGuid().ToString("N"); var b = System.Text.Encoding.UTF8.GetBytes(content); Files[id] = (new Remote(id, "root", name, "file", Hash(b), 1, null, b.Length), b); }
    HttpResponseMessage Json(object body) => new(HttpStatusCode.OK) { Content = JsonContent.Create(body) };
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken stop)
    {
        var path = request.RequestUri!.AbsolutePath;
        if (path.EndsWith("manifest")) return Json(new Manifest("two-way", Files.Values.Select(f => f.r).ToList()));
        if (path.Contains("/content/")) { var f = Files[path.Split('/').Last()]; var offset = request.Headers.Range?.Ranges.Single().From ?? 0; return new(offset > 0 ? HttpStatusCode.PartialContent : HttpStatusCode.OK) { Content = new ByteArrayContent(f.bytes[(int)offset..]) }; }
        if (request.Method == HttpMethod.Delete) { var id = path.Split('/').Last(); var f = Files[id]; Files[id] = (f.r with { deleted = DateTimeOffset.UtcNow.ToString("O") }, f.bytes); Deletes++; return Json(new { }); }
        if (path.EndsWith("/uploads")) { var j = await request.Content!.ReadFromJsonAsync<JsonElement>(stop); name = j.GetProperty("name").GetString()!; parent = j.GetProperty("parent").GetString()!; upload = new(); Offset = 0; return Json(new { id = "upload", offset = 0 }); }
        if (request.Method == HttpMethod.Get && path.Contains("/uploads/")) return Json(new { offset = Offset, committed = (string?)null });
        if (request.Method == HttpMethod.Patch) { if (Interrupt && Offset > 0) return new(HttpStatusCode.ServiceUnavailable); var b = await request.Content!.ReadAsByteArrayAsync(stop); Assert.Equal(Hash(b), request.Headers.GetValues("Upload-Checksum").Single()); Assert.Equal(Offset.ToString(), request.Headers.GetValues("Upload-Offset").Single()); upload.Write(b); Offset += b.Length; return Json(new { offset = Offset }); }
        if (path.EndsWith("/commit")) { var id = Guid.NewGuid().ToString("N"); var b = upload.ToArray(); Files[id] = (new Remote(id, parent, name, "file", Hash(b), 1, null, b.Length), b); Commits++; return Json(new { id }); }
        throw new Exception("Unexpected protocol request: " + path);
    }
}

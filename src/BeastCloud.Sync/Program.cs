using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Net.Http.Headers;
var argsList = args.ToList(); string Arg(string key, string fallback = "") { var i = argsList.IndexOf("--" + key); return i >= 0 && i + 1 < argsList.Count ? argsList[i + 1] : fallback; }
var home = Arg("profile", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BeastCloudSync", "default"));
try
{
    Directory.CreateDirectory(home); var configPath = Path.Combine(home, "config.json"); var cmd = args.FirstOrDefault() ?? "help";
    if (cmd == "pair")
    {
        var url = Arg("url"); if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/") throw new Exception("Use a trusted HTTPS server origin (https://host:5443)");
        var folder = Path.GetFullPath(Arg("folder")); if (!Directory.Exists(folder)) throw new Exception("Select an existing folder"); Sync.Safe(folder); if (File.Exists(configPath)) throw new Exception("Profile already paired. Use a different --profile or remove the pairing first."); Console.Write("One-time pairing code: "); var code = Console.ReadLine()?.Trim() ?? "";
        using var http = new HttpClient { BaseAddress = uri }; var response = await http.PostAsJsonAsync("/api/pair", new { code }); response.EnsureSuccessStatusCode(); var pair = await response.Content.ReadFromJsonAsync<Pair>() ?? throw new Exception("Pairing failed"); var marker = Guid.NewGuid().ToString("N"); var config = new Config { Url = url, Folder = folder, Id = pair.id, RemoteFolder = pair.folder, Mode = pair.mode, Marker = marker, Token = Protect(pair.token) }; await Save(configPath, config); await File.WriteAllTextAsync(Path.Combine(folder, ".beastcloud-volume"), marker); Console.WriteLine("Paired. Run: BeastCloud.Sync.exe run --profile \"" + home + "\""); return;
    }
    if (cmd == "help") { Console.WriteLine("BeastCloud.Sync pair --url https://host:5443 --folder C:\\ChosenFolder [--profile path]\nBeastCloud.Sync run|once|status|pause|resume|remove [--profile path]\nSet propagateDeletes and ignore patterns in the profile's config.json while paused. Deletions default OFF. TLS trust is required; no bypass exists."); return; }
    if (!File.Exists(configPath)) throw new Exception("Profile is not paired"); var cfg = JsonSerializer.Deserialize<Config>(await File.ReadAllTextAsync(configPath))!;
    if (cmd is "pause" or "resume") { cfg.Paused = cmd == "pause"; await Save(configPath, cfg); Console.WriteLine(cmd + " complete"); return; }
    if (cmd == "remove") { Console.WriteLine("Revoke the device in the server UI, then delete this profile directory. Selected files are never removed by this command."); return; }
    if (cmd == "status") { Console.WriteLine(JsonSerializer.Serialize(new { cfg.Url, cfg.Folder, cfg.Mode, cfg.Paused, cfg.PropagateDeletes, state = File.Exists(Path.Combine(home, "state.json")) ? JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(home, "state.json"))).RootElement : (object?)null }, new JsonSerializerOptions { WriteIndented = true })); return; }
    if (cmd is not ("run" or "once")) throw new Exception("Unknown command");
    using var single = new FileStream(Path.Combine(home, "process.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); using var client = new HttpClient { BaseAddress = new Uri(cfg.Url), Timeout = TimeSpan.FromMinutes(5) }; client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Unprotect(cfg.Token)); var sync = new Sync(client, home, cfg); int failures = 0;
    using var watcher = new FileSystemWatcher(cfg.Folder) { IncludeSubdirectories = true, EnableRaisingEvents = true }; var signal = new SemaphoreSlim(0, 1); void Wake(object? s, FileSystemEventArgs e) { if (signal.CurrentCount == 0) try { signal.Release(); } catch (SemaphoreFullException) { } }
    watcher.Changed += Wake; watcher.Created += Wake; watcher.Deleted += Wake; watcher.Renamed += Wake;
    do { try { cfg = JsonSerializer.Deserialize<Config>(await File.ReadAllTextAsync(configPath))!; if (!cfg.Paused) { await sync.Reconcile(cfg); failures = 0; } } catch (Exception e) { failures++; Console.Error.WriteLine("Sync paused safely: " + e.Message); if (cmd == "once") throw; } if (cmd == "once") break; await signal.WaitAsync(TimeSpan.FromSeconds(Math.Min(300, 10 * Math.Pow(2, Math.Min(failures, 5))))); await Task.Delay(500); } while (true);
}
catch (Exception e) { Console.Error.WriteLine(e.Message); Environment.ExitCode = 1; }
string Protect(string s) { if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Pairing requires Windows DPAPI"); return Convert.ToBase64String(ProtectedData.Protect(System.Text.Encoding.UTF8.GetBytes(s), null, DataProtectionScope.CurrentUser)); }
string Unprotect(string s) { if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Device credentials require Windows DPAPI"); return System.Text.Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(s), null, DataProtectionScope.CurrentUser)); }
static async Task Save<T>(string path, T value) { await File.WriteAllTextAsync(path + ".new", JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true })); File.Move(path + ".new", path, true); }
public record Pair(string id, string token, string folder, string mode);
public sealed class Config { public string Url { get; set; } = ""; public string Folder { get; set; } = ""; public string Id { get; set; } = ""; public string RemoteFolder { get; set; } = ""; public string Token { get; set; } = ""; public string Marker { get; set; } = ""; public string Mode { get; set; } = "two-way"; public bool Paused { get; set; } public bool PropagateDeletes { get; set; } public string[] Ignore { get; set; } = ["*.tmp", "~$*", ".beastcloud-*"]; }
public sealed class Entry { public string Id { get; set; } = ""; public string Hash { get; set; } = ""; public long Revision { get; set; } public string Path { get; set; } = ""; }
public sealed class Pending { public string Id { get; set; } = ""; public string Hash { get; set; } = ""; }
public sealed class State { public Dictionary<string, Entry> Files { get; set; } = new(StringComparer.OrdinalIgnoreCase); public Dictionary<string, Pending> Uploads { get; set; } = new(StringComparer.OrdinalIgnoreCase); public string LastRun { get; set; } = ""; public List<string> Conflicts { get; set; } = []; }
public sealed record Remote(string id, string? parent, string name, string kind, string? checksum, long revision, string? deleted, long size);
public sealed record Manifest(string mode, List<Remote> items);
public sealed class Sync(HttpClient http, string home, Config original)
{
    State state = File.Exists(Path.Combine(home, "state.json")) ? JsonSerializer.Deserialize<State>(File.ReadAllText(Path.Combine(home, "state.json")))! : new(); Config cfg = original;
    async Task Save() { var p = Path.Combine(home, "state.json"); await File.WriteAllTextAsync(p + ".new", JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true })); File.Move(p + ".new", p, true); }
    public static void Safe(string p) { var d = new DirectoryInfo(p); while (d != null) { if (d.Exists && (d.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Reparse-point folder refused"); d = d.Parent; } if (File.Exists(p) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) throw new IOException("Reparse-point file refused"); }
    string Local(string relative) { if (Path.IsPathRooted(relative) || relative.Split('/', '\\').Any(n => n is "." or ".." || n.IndexOfAny("<>:\"|?*".ToCharArray()) >= 0 || Regex.IsMatch(n, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)", RegexOptions.IgnoreCase) || n.EndsWith('.') || n.EndsWith(' '))) throw new Exception("Unsafe remote path"); var p = Path.GetFullPath(Path.Combine(cfg.Folder, relative)); if (!p.StartsWith(cfg.Folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Path escape"); Safe(p); return p; }
    bool Ignored(string relative) => relative.Split('/', '\\').Any(part => cfg.Ignore.Any(pattern => Regex.IsMatch(part, "^" + Regex.Escape(pattern).Replace("\\*", ".*").Replace("\\?", ".") + "$", RegexOptions.IgnoreCase)));
    static async Task<string> Hash(string path) { await using var f = File.OpenRead(path); return Convert.ToHexStringLower(await SHA256.HashDataAsync(f)); }
    async Task<JsonElement> Send(string path, object body) { var r = await http.PostAsJsonAsync(path, body); r.EnsureSuccessStatusCode(); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
    void Ready() { if (!Directory.Exists(cfg.Folder) || !File.Exists(Path.Combine(cfg.Folder, ".beastcloud-volume")) || File.ReadAllText(Path.Combine(cfg.Folder, ".beastcloud-volume")) != cfg.Marker) throw new IOException("Selected volume marker unavailable; no deletions propagated"); Safe(cfg.Folder); }
    void Conflict(string path) { var full = Local(path); if (!File.Exists(full)) return; var ext = Path.GetExtension(path); var rel = path[..^ext.Length] + " (conflict " + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..6] + ")" + ext; File.Move(full, Local(rel)); state.Conflicts.Add(rel); Console.WriteLine("Conflict preserved: " + rel); }
    public async Task Reconcile(Config latest)
    {
        cfg = latest; Ready(); var manifest = await http.GetFromJsonAsync<Manifest>("/api/sync/manifest") ?? throw new Exception("No manifest"); var map = manifest.items.ToDictionary(i => i.id); var dirs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { { "", cfg.RemoteFolder } }; string Rel(Remote f) { var parts = new List<string> { f.name }; var p = f.parent; var seen = new HashSet<string>(); while (p != cfg.RemoteFolder && p != null) { if (!seen.Add(p) || !map.TryGetValue(p, out var parent)) throw new Exception("Incomplete server tree; reconciliation suspended"); parts.Add(parent.name); p = parent.parent; } parts.Reverse(); return string.Join(Path.DirectorySeparatorChar, parts); }
        var remotePaths = new Dictionary<string, Remote>(StringComparer.OrdinalIgnoreCase); foreach (var r in manifest.items) { var path = Rel(r); if (Ignored(path)) continue; Local(path); if (r.kind == "folder") { if (r.deleted == null) dirs[path] = r.id; continue; } remotePaths.Add(path, r); }
        // Snapshot enumeration must finish successfully before considering any deletion.
        var local = Scan(cfg.Folder).Where(p => !Ignored(Path.GetRelativePath(cfg.Folder, p))).ToDictionary(p => Path.GetRelativePath(cfg.Folder, p), p => p, StringComparer.OrdinalIgnoreCase); Ready();
        if (manifest.mode != "upload-only") foreach (var (path, r) in remotePaths)
        {
            Ready(); var full = Local(path); var old = state.Files.Values.FirstOrDefault(v => v.Id == r.id); if (old != null && old.Path != path && File.Exists(Local(old.Path)) && !File.Exists(full)) { if (await Hash(Local(old.Path)) == old.Hash) { Directory.CreateDirectory(Path.GetDirectoryName(full)!); File.Move(Local(old.Path), full); state.Files.Remove(old.Path); old.Path = path; state.Files[path] = old; } }
            var exists = File.Exists(full); var hash = exists ? await Hash(full) : null;
            if (r.deleted != null) { if (exists && old != null && cfg.PropagateDeletes) { if (hash != old.Hash) Conflict(path); else { var trash = Path.Combine(home, "trash", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(Path.GetDirectoryName(trash)!); File.Move(full, trash); } state.Files.Remove(path); await Save(); } continue; }
            if (hash == r.checksum) { state.Files[path] = new() { Id = r.id, Path = path, Hash = hash!, Revision = r.revision }; continue; }
            if (old != null && !exists && cfg.PropagateDeletes && manifest.mode != "download-only") { if (r.revision == old.Revision) { var response = await http.DeleteAsync("/api/sync/items/" + r.id); response.EnsureSuccessStatusCode(); state.Files.Remove(path); await Save(); continue; } }
            if (old != null && r.revision == old.Revision && exists) continue;
            if (exists && (old == null || hash != old.Hash)) Conflict(path);
            await Download(r, path); state.Files[path] = new() { Id = r.id, Path = path, Hash = r.checksum!, Revision = r.revision }; await Save();
        }
        if (manifest.mode != "download-only")
        {
            local = Scan(cfg.Folder).Where(p => !Ignored(Path.GetRelativePath(cfg.Folder, p))).ToDictionary(p => Path.GetRelativePath(cfg.Folder, p), p => p, StringComparer.OrdinalIgnoreCase);
            foreach (var (path, full) in local)
            {
                Ready(); var hash = await Hash(full); state.Files.TryGetValue(path, out var old); remotePaths.TryGetValue(path, out var remote); if (remote?.deleted != null) { if (old != null && hash == old.Hash) continue; Conflict(path); continue; }
                if (old != null && hash == old.Hash) continue; if (remote != null && (old == null || remote.revision != old.Revision) && hash != remote.checksum) { Conflict(path); continue; }
                if (remote != null && hash == remote.checksum) { state.Files[path] = new() { Id = remote.id, Path = path, Hash = hash, Revision = remote.revision }; continue; }
                var parent = Path.GetDirectoryName(path) ?? ""; async Task<string> Folder(string dir) { if (dirs.TryGetValue(dir, out var id)) return id; var pid = await Folder(Path.GetDirectoryName(dir) ?? ""); var result = await Send("/api/sync/folders", new { parent = pid, name = Path.GetFileName(dir) }); return dirs[dir] = result.GetProperty("id").GetString()!; }
                var folder = await Folder(parent); var uploaded = await Upload(full, path, hash, folder, remote); state.Files[path] = new() { Id = uploaded, Path = path, Hash = hash, Revision = remote == null ? 1 : remote.revision + 1 }; await Save();
            }
            if (cfg.PropagateDeletes) foreach (var (path, old) in state.Files.ToArray()) { if (File.Exists(Local(path))) continue; if (!map.TryGetValue(old.Id, out var r) || r.deleted != null) continue; if (r.revision != old.Revision) continue; Ready(); var response = await http.DeleteAsync("/api/sync/items/" + old.Id); response.EnsureSuccessStatusCode(); state.Files.Remove(path); await Save(); }
        }
        state.LastRun = DateTimeOffset.UtcNow.ToString("O"); await Save(); Console.WriteLine("Reconciled " + state.Files.Count + " tracked files; " + state.Conflicts.Count + " conflicts retained.");
    }
    static IEnumerable<string> Scan(string root) { Safe(root); foreach (var p in Directory.EnumerateFileSystemEntries(root)) { Safe(p); if (Path.GetFileName(p).StartsWith(".beastcloud-", StringComparison.OrdinalIgnoreCase)) continue; if (Directory.Exists(p)) { foreach (var f in Scan(p)) yield return f; } else yield return p; } }
    async Task Download(Remote r, string path) { var dest = Local(path); Directory.CreateDirectory(Path.GetDirectoryName(dest)!); var temp = dest + ".beastcloud-part-" + r.id + "-" + r.revision; Safe(temp); var offset = File.Exists(temp) ? new FileInfo(temp).Length : 0; if (offset > r.size) { File.Delete(temp); offset = 0; } using var request = new HttpRequestMessage(HttpMethod.Get, "/api/sync/content/" + r.id); if (offset > 0) request.Headers.Range = new RangeHeaderValue(offset, null); using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead); if (response.StatusCode == System.Net.HttpStatusCode.RequestedRangeNotSatisfiable && offset == r.size) { } else { response.EnsureSuccessStatusCode(); if (offset > 0 && response.StatusCode != System.Net.HttpStatusCode.PartialContent) { offset = 0; File.Delete(temp); } await using var output = new FileStream(temp, offset > 0 ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None); await response.Content.CopyToAsync(output); output.Flush(true); } if (await Hash(temp) != r.checksum) throw new IOException("Download checksum mismatch"); Ready(); File.Move(temp, dest, true); }
    async Task<string> Upload(string full, string path, string hash, string folder, Remote? old)
    {
        Pending? p = null; if (state.Uploads.TryGetValue(path, out var existing) && existing.Hash == hash) p = existing; long offset = 0; if (p != null) { var response = await http.GetAsync("/api/sync/uploads/" + p.Id); if (response.IsSuccessStatusCode) { var u = await response.Content.ReadFromJsonAsync<JsonElement>(); if (u.GetProperty("committed").ValueKind == JsonValueKind.String) { state.Uploads.Remove(path); return u.GetProperty("committed").GetString()!; } offset = u.GetProperty("offset").GetInt64(); } else p = null; }
        var size = new FileInfo(full).Length; if (p == null) { var u = await Send("/api/sync/uploads", new { name = Path.GetFileName(path), parent = folder, total = size, checksum = hash, itemId = old?.id, baseRevision = old?.revision }); p = new() { Id = u.GetProperty("id").GetString()!, Hash = hash }; state.Uploads[path] = p; await Save(); }
        await using var f = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read); f.Position = offset; var buffer = new byte[4194304]; while (offset < size) { int n = await f.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, size - offset))); if (n == 0) throw new IOException("File changed during upload"); using var message = new HttpRequestMessage(HttpMethod.Patch, "/api/sync/uploads/" + p.Id) { Content = new ByteArrayContent(buffer, 0, n) }; message.Headers.Add("Upload-Offset", offset.ToString()); message.Headers.Add("Upload-Checksum", Convert.ToHexStringLower(SHA256.HashData(buffer.AsSpan(0, n)))); var result = await http.SendAsync(message); result.EnsureSuccessStatusCode(); offset += n; Console.WriteLine("Upload " + path + " " + offset + "/" + size); }
        if (await Hash(full) != hash) throw new IOException("File changed; upload left uncommitted"); var commit = await Send("/api/sync/uploads/" + p.Id + "/commit", new { }); state.Uploads.Remove(path); return commit.GetProperty("id").GetString()!;
    }
}

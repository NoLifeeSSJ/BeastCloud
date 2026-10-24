using System.Security.Cryptography;
using System.Text.RegularExpressions;
namespace BeastCloud;

public sealed partial class Storage
{
    public string Root { get; }
    public string Files { get; }
    public string Data => Path.Combine(Root, "data");
    public SemaphoreSlim Gate { get; } = new(1, 1);
    public Storage(string root, string? files)
    {
        Root = Path.GetFullPath(root); Files = Path.GetFullPath(files ?? Path.Combine(Data, "files"));
        if (OperatingSystem.IsWindows() && (Root.StartsWith(@"\\") || Files.StartsWith(@"\\"))) throw new InvalidOperationException("Live data and managed storage require local disks.");
        CheckPath(Root);CheckPath(Files);
        var initialized = File.Exists(Path.Combine(Root, "config", "storage.json"));
        if (initialized && !File.Exists(Path.Combine(Files, ".beastcloud-volume"))) throw new IOException("Configured storage is unavailable; refusing to create an empty replacement.");
        foreach (var p in new[] { "config", "data/db", "data/versions", "data/trash", "data/thumbnails", "data/search", "data/temp", "logs", "backups" }) Directory.CreateDirectory(Path.Combine(Root, p));
        Directory.CreateDirectory(Files); CheckPath(Files); CheckPath(Data);
        if (!initialized) { File.WriteAllText(Path.Combine(Files, ".beastcloud-volume"), Guid.NewGuid().ToString()); File.WriteAllText(Path.Combine(Root, "config", "storage.json"), System.Text.Json.JsonSerializer.Serialize(new { files = Files })); }
    }
    public void Available() { CheckPath(Files); if (!File.Exists(Path.Combine(Files, ".beastcloud-volume"))) throw new IOException("Managed storage volume is unavailable. No changes were made."); }
    public static void CheckPath(string path) { var current = new DirectoryInfo(Path.GetFullPath(path)); while (current != null) { if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Reparse points and symbolic links are not allowed in managed storage."); current = current.Parent; } }
    public string Blob(string id) { if (!Regex.IsMatch(id, "^[a-f0-9]{32}$")) throw new ArgumentException("Invalid blob identity"); Available(); var p = Path.Combine(Files, id); if (File.Exists(p) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) throw new IOException("Unsafe blob path"); return p; }
    public string Temp(string id) { if (!Regex.IsMatch(id, "^[a-f0-9]{32}$")) throw new ArgumentException("Invalid transfer identity"); var p = Path.Combine(Data, "temp", id); CheckPath(Path.GetDirectoryName(p)!); if (File.Exists(p) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) throw new IOException("Unsafe staging path"); return p; }
    public static string Name(string name) { if (string.IsNullOrWhiteSpace(name) || name.Length > 180 || name is "." or ".." || name.EndsWith('.') || name.EndsWith(' ') || name.Any(c => c < 32 || "<>:\"/\\|?*".Contains(c)) || Regex.IsMatch(name, @"^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)", RegexOptions.IgnoreCase)) throw new ArgumentException("Invalid Windows file name"); return name.Normalize(); }
    public void Space(long bytes) { Available(); var drive = new DriveInfo(Path.GetPathRoot(Files)!); if (drive.AvailableFreeSpace < bytes + 64 * 1024 * 1024) throw new IOException("Insufficient disk space; at least 64 MiB must remain free."); }
    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value)));
    public static string Token() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    public static async Task<string> Checksum(string path) { await using var f = File.OpenRead(path); return Convert.ToHexStringLower(await SHA256.HashDataAsync(f)); }
}

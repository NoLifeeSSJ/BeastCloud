using System.Security.Cryptography;
using System.IO.Compression;
using System.Text;
namespace BeastCloud;
// Versioned, chunk-authenticated archive. PBKDF2-HMAC-SHA256 + AES-256-GCM.
public static class BackupCrypto
{
    static readonly byte[] Magic = Encoding.ASCII.GetBytes("BEASTENC1");
    public static void Encrypt(string source, string output, string password) { if (password.Length < 16) throw new ArgumentException("Use a backup passphrase of at least 16 characters"); if (File.Exists(output)) throw new IOException("Output exists"); var zip = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".zip"); try { ZipFile.CreateFromDirectory(source, zip, CompressionLevel.Fastest, false); using var input = File.OpenRead(zip); using var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write); file.Write(Magic); var salt = RandomNumberGenerator.GetBytes(32); file.Write(salt); var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32); try { using var aes = new AesGcm(key, 16); using var writer = new BinaryWriter(file, Encoding.UTF8, true); var buffer = new byte[1024 * 1024]; int index = 0; while (true) { var n = input.Read(buffer); var nonce = RandomNumberGenerator.GetBytes(12); var encrypted = new byte[n]; var tag = new byte[16]; aes.Encrypt(nonce, buffer.AsSpan(0, n), encrypted, tag, BitConverter.GetBytes(index++)); writer.Write(n); writer.Write(nonce); writer.Write(tag); writer.Write(encrypted); if (n == 0) break; } writer.Flush(); file.Flush(true); } finally { CryptographicOperations.ZeroMemory(key); } } catch { File.Delete(output); throw; } finally { File.Delete(zip); } }
    public static void Decrypt(string source, string destination, string password)
    {
        if (Directory.Exists(destination)) throw new IOException("Destination must not exist"); var zip = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".zip"); try
        {
            using (var file = File.OpenRead(source)) using (var reader = new BinaryReader(file)) { if (!reader.ReadBytes(9).SequenceEqual(Magic)) throw new IOException("Unsupported encrypted backup"); var salt = reader.ReadBytes(32); if (salt.Length != 32) throw new IOException("Truncated backup"); var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32); try { using var aes = new AesGcm(key, 16); using var output = File.Create(zip); int index = 0; while (true) { int n = reader.ReadInt32(); if (n < 0 || n > 1024 * 1024) throw new IOException("Invalid archive chunk"); var nonce = reader.ReadBytes(12); var tag = reader.ReadBytes(16); var encrypted = reader.ReadBytes(n); if (nonce.Length != 12 || tag.Length != 16 || encrypted.Length != n) throw new IOException("Truncated archive chunk"); var plain = new byte[n]; aes.Decrypt(nonce, encrypted, tag, plain, BitConverter.GetBytes(index++)); if (n == 0) { if (file.Position != file.Length) throw new IOException("Unexpected archive data"); break; } output.Write(plain); } } finally { CryptographicOperations.ZeroMemory(key); } }
            // ZipFile's extractor rejects paths outside destination; reject links and excessive expansion too.
            using (var archive = ZipFile.OpenRead(zip)) { long size = 0; foreach (var e in archive.Entries) { if ((e.ExternalAttributes >> 16 & 0xF000) == 0xA000 || e.FullName.Contains(':') || e.FullName.Split('/', '\\').Any(n => n == "..")) throw new IOException("Unsafe archive entry"); size = checked(size + e.Length); } var drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(destination))!); if (size + 64 * 1024 * 1024 > drive.AvailableFreeSpace) throw new IOException("Insufficient restore space"); }
            ZipFile.ExtractToDirectory(zip, destination, false);
        }
        finally { File.Delete(zip); }
    }
}

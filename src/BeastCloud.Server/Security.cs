using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
namespace BeastCloud;

public sealed class Security(Database db)
{
    readonly PasswordHasher<string> hasher = new(new Microsoft.Extensions.Options.OptionsWrapper<PasswordHasherOptions>(new() { IterationCount = 210000 }));
    public string Password(string value) { if (value.Length < 12 || value.Length > 256) throw new ArgumentException("Use a password of 12–256 characters"); return hasher.HashPassword("", value); }
    public bool Verify(string hash, string value) { try { return hasher.VerifyHashedPassword("", hash, value) != PasswordVerificationResult.Failed; } catch { return false; } }
    public Dictionary<string, object?>? User(HttpContext c) { var token = c.Request.Cookies["beast.session"]; if (token == null) return null; return db.Rows("SELECT u.*,s.csrf,s.hash sessionHash FROM sessions s JOIN users u ON u.id=s.userId WHERE s.hash=$h AND s.expires>$n", ("$h", Storage.Hash(token)), ("$n", Database.Now)).FirstOrDefault(); }
    public object Session(HttpContext c, Dictionary<string, object?> u) { var token = Storage.Token(); var csrf = Storage.Token(); db.Execute("INSERT INTO sessions VALUES($h,$u,$c,$e)", ("$h", Storage.Hash(token)), ("$u", u["id"]), ("$c", csrf), ("$e", DateTimeOffset.UtcNow.AddHours(12).ToString("O"))); c.Response.Cookies.Append("beast.session", token, new() { HttpOnly = true, Secure = !c.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(), SameSite = SameSiteMode.Strict, Path = "/", MaxAge = TimeSpan.FromHours(12) }); return new { id = u["id"], name = u["name"], role = u["role"], csrf }; }
    public static string TotpSecret() => Base32(RandomNumberGenerator.GetBytes(20));
    public static string Base32(byte[] bytes) { const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; int acc = 0, bits = 0; var s = new StringBuilder(); foreach (var b in bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; s.Append(chars[(acc >> bits) & 31]); } } return s.ToString(); }
    static byte[] Decode(string s) { int a = 0, b = 0; var r = new List<byte>(); foreach (var c in s) { a = (a << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".IndexOf(c); b += 5; if (b >= 8) { b -= 8; r.Add((byte)(a >> b)); } } return r.ToArray(); }
    public static bool Totp(string secret, string code) { for (int d = -1; d <= 1; d++) { var step = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30 + d; var buffer = BitConverter.GetBytes(System.Net.IPAddress.HostToNetworkOrder(step)); var h = HMACSHA1.HashData(Decode(secret), buffer); int o = h[^1] & 15; var n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]; if (CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes((n % 1000000).ToString("D6")), Encoding.ASCII.GetBytes(code))) return true; } return false; }
    public bool SecondFactor(Dictionary<string, object?> u, string? code) { if (u["totp"] == null) return true; if (code == null) return false; if (Totp((string)u["totp"]!, code)) return true; var codes = System.Text.Json.JsonSerializer.Deserialize<List<string>>((string)u["recovery"]!)!; if (!codes.Remove(Storage.Hash(code))) return false; db.Execute("UPDATE users SET recovery=$r WHERE id=$id", ("$r", System.Text.Json.JsonSerializer.Serialize(codes)), ("$id", u["id"])); return true; }
}

using System.Text.Json;
namespace BeastCloud;

public sealed partial class Cloud
{
    static void MapUploads(WebApplication app)
    {
        app.MapPost("/api/uploads", async (HttpContext c, Cloud x, JsonElement j) => Results.Ok(await x.BeginUpload(Actor(c), j)));
        app.MapGet("/api/uploads/{id}", (HttpContext c, Cloud x, string id) => x.Upload(id, Actor(c)));
        app.MapPatch("/api/uploads/{id}", async (HttpContext c, Cloud x, string id) => Results.Ok(new { offset = await x.Chunk(id, Actor(c), c) }));
        app.MapPost("/api/uploads/{id}/commit", async (HttpContext c, Cloud x, string id) => Results.Ok(new { id = await x.Commit(id, Actor(c)) }));
        app.MapDelete("/api/uploads/{id}", async (HttpContext c, Cloud x, string id) => { await Locked(x.disk, () => { var u = x.Upload(id, Actor(c)); if (u["committed"] != null) throw new InvalidOperationException("Upload already committed"); File.Delete(x.disk.Temp(id)); x.db.Execute("DELETE FROM uploads WHERE id=$id", ("$id", id)); return Task.CompletedTask; }); return Results.Ok(); });
    }
    public Dictionary<string, object?> Upload(string id, string actor) => db.Rows("SELECT * FROM uploads WHERE id=$id AND userId=$u", ("$id", id), ("$u", actor)).FirstOrDefault() ?? throw new ArgumentException("Transfer not found");
    public async Task<object> BeginUpload(string actor, JsonElement j)
    {
        string id = Id(); await Locked(disk, () =>
        {
            var name = Storage.Name(S(j, "name") ?? ""); var parent = S(j, "parent"); Parent(parent); var total = L(j, "total"); var max = long.TryParse(db.Setting("uploadLimit"), out var n) ? n : 100L * 1024 * 1024 * 1024;
            if (total < 0 || total > max) throw new ArgumentException("File exceeds the configured upload limit"); var pending = Convert.ToInt64(db.Scalar("SELECT COALESCE(SUM(total),0) FROM uploads WHERE committed IS NULL")); if (pending + total > max) throw new InvalidOperationException("Upload staging reservation limit reached");
            disk.Space(total); var stageDrive = new DriveInfo(Path.GetPathRoot(disk.Data)!); if (stageDrive.AvailableFreeSpace < total + 64 * 1024 * 1024) throw new IOException("Insufficient staging disk space");
            if (S(j, "itemId") is string item) { var i = Item(item); if ((string)i["kind"] != "file" || L(j, "baseRevision", -1) != Convert.ToInt64(i["revision"])) throw new InvalidOperationException("Version conflict; preserve both copies"); }
            using (var f = new FileStream(disk.Temp(id), FileMode.CreateNew, FileAccess.Write, FileShare.None)) { f.Flush(true); }
            db.Execute("INSERT INTO uploads(id,userId,parent,name,itemId,total,expected,created,baseRevision) VALUES($id,$u,$p,$n,$i,$t,$h,$c,$r)", ("$id", id), ("$u", actor), ("$p", parent), ("$n", name), ("$i", S(j, "itemId")), ("$t", total), ("$h", S(j, "checksum")), ("$c", Database.Now), ("$r", j.TryGetProperty("baseRevision", out _) ? L(j, "baseRevision") : null)); return Task.CompletedTask;
        }); return new { id, offset = 0, chunkSize = 4 * 1024 * 1024 };
    }
    public async Task<long> Chunk(string id, string actor, HttpContext c)
    {
        long result = 0; await Locked(disk, async () =>
        {
            var u = Upload(id, actor); if (u["committed"] != null) throw new InvalidOperationException("Transfer committed"); if (!long.TryParse(c.Request.Headers["Upload-Offset"], out var offset) || offset != Convert.ToInt64(u["offset"])) throw new InvalidOperationException("Offset mismatch; query transfer and resume"); var length = c.Request.ContentLength ?? throw new ArgumentException("Content-Length required"); if (length < 1 || length > 4 * 1024 * 1024 || offset + length > Convert.ToInt64(u["total"])) throw new ArgumentException("Invalid chunk size"); disk.Space(length);
            var chunk = disk.Temp(id) + ".chunk"; if(File.Exists(chunk)&&(File.GetAttributes(chunk)&FileAttributes.ReparsePoint)!=0)throw new IOException("Unsafe staging chunk path"); try
            {
                await using (var f = new FileStream(chunk, FileMode.Create, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous)) { await c.Request.Body.CopyToAsync(f, c.RequestAborted); await f.FlushAsync(c.RequestAborted); f.Flush(true); }
                if (new FileInfo(chunk).Length != length) throw new IOException("Incomplete chunk"); var expected = c.Request.Headers["Upload-Checksum"].ToString(); if (expected.Length != 64 || await Storage.Checksum(chunk) != expected) throw new ArgumentException("Chunk checksum mismatch");
                await using (var f = new FileStream(disk.Temp(id), FileMode.Open, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous)) { f.SetLength(offset); f.Position = offset; await using var input = File.OpenRead(chunk); await input.CopyToAsync(f, c.RequestAborted); await f.FlushAsync(c.RequestAborted); f.Flush(true); }
                result = offset + length; db.Execute("UPDATE uploads SET offset=$o WHERE id=$id", ("$o", result), ("$id", id));
            }
            finally { File.Delete(chunk); }
        }); return result;
    }
    public async Task<string> Commit(string id, string actor)
    {
        string result = ""; await Locked(disk, async () =>
        {
            var u = Upload(id, actor); if (u["committed"] is string committed) { result = committed; return; }
            if (Convert.ToInt64(u["offset"]) != Convert.ToInt64(u["total"])) throw new InvalidOperationException("Transfer is incomplete"); disk.Available(); var checksum = await Storage.Checksum(disk.Temp(id)); if (u["expected"] is string expected && expected != checksum) throw new ArgumentException("File checksum mismatch"); Parent(u["parent"] as string); Dictionary<string, object?>? old = null;
            if (u["itemId"] is string item) { old = Item(item); if (Convert.ToInt64(old["revision"]) != Convert.ToInt64(u["baseRevision"])) throw new InvalidOperationException("Version conflict; preserve both copies"); result = item; } else result = Id();
            // Immutable blob is durable before metadata references it. A failed DB commit leaves a harmless orphan.
            var blob = Id(); disk.Space(Convert.ToInt64(u["total"])); await using (var src = File.OpenRead(disk.Temp(id))) await using (var dst = new FileStream(disk.Blob(blob), FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous)) { await src.CopyToAsync(dst); await dst.FlushAsync(); dst.Flush(true); }
            db.Transaction(c => { if (old != null) { SaveVersion(c, old); Database.Exec(c, "UPDATE items SET blob=$b,size=$s,checksum=$h,revision=revision+1,modified=$m WHERE id=$id", ("$b", blob), ("$s", u["total"]), ("$h", checksum), ("$m", Database.Now), ("$id", result)); } else Database.Exec(c, "INSERT INTO items(id,parent,name,kind,blob,size,checksum,modified) VALUES($id,$p,$n,'file',$b,$s,$h,$m)", ("$id", result), ("$p", u["parent"]), ("$n", u["name"]), ("$b", blob), ("$s", u["total"]), ("$h", checksum), ("$m", Database.Now)); Database.Exec(c, "UPDATE uploads SET committed=$i WHERE id=$id", ("$i", result), ("$id", id)); }); File.Delete(disk.Temp(id)); db.Job("index", result); db.Job("thumbnail", result); db.Audit(actor, "upload.committed", result);
        }); return result;
    }
}

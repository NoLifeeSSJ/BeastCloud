using System.IO.Compression;
namespace BeastCloud;

public sealed partial class Cloud
{
    static void MapArchives(WebApplication app)
    {
        app.MapGet("/api/archive", (HttpContext context, Cloud x, string ids) =>
        {
            var selected = ids.Split(',', StringSplitOptions.RemoveEmptyEntries).Distinct().ToArray(); if (selected.Length is < 1 or > 100) throw new ArgumentException("Select between 1 and 100 archive roots"); var entries = new Dictionary<string, (string path, string blob)>(); foreach (var id in selected) { var root = x.Item(id); var rows = x.db.Rows("WITH RECURSIVE tree(id,path) AS (SELECT id,name FROM items WHERE id=$id AND deleted IS NULL UNION ALL SELECT i.id,t.path||'/'||i.name FROM items i JOIN tree t ON i.parent=t.id WHERE i.deleted IS NULL) SELECT i.id,i.blob,i.kind,t.path FROM items i JOIN tree t ON i.id=t.id", ("$id", id)); foreach (var row in rows) { if (entries.Count >= 10000) throw new ArgumentException("Archive exceeds 10,000 entries; use a local export"); if ((string)row["kind"] != "file") continue; var path = (string)row["path"]!; foreach (var part in path.Split('/')) Storage.Name(part); entries[(string)row["id"]!] = (path, (string)row["blob"]!); } }
            var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase); foreach (var entry in entries.Values) { if (!unique.Add(entry.path)) throw new ArgumentException("Selected roots have colliding paths; download separately"); if (!File.Exists(x.disk.Blob(entry.blob))) throw new IOException("Archive source storage unavailable"); }
            // ZipArchive emits small synchronous headers/trailers; payload copies remain asynchronous.
            if(context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpBodyControlFeature>() is {} bodyControl)bodyControl.AllowSynchronousIO=true;
            return Results.Stream(async stream => { await x.disk.Gate.WaitAsync(); try { using var archive = new ZipArchive(stream, ZipArchiveMode.Create, true); foreach (var entry in entries.Values) { var output = archive.CreateEntry(entry.path, CompressionLevel.Fastest); await using var target = output.Open(); await using var source = File.OpenRead(x.disk.Blob(entry.blob)); await source.CopyToAsync(target); } } finally { x.disk.Gate.Release(); } }, "application/zip", "beastcloud-files.zip");
        });
    }
}

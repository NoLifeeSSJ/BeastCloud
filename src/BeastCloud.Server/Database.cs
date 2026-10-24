using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace BeastCloud;

public sealed class Database(string path)
{
    public SqliteConnection Open() { var c = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString()); c.Open(); c.CreateCollation("NOCASE",(a,b)=>string.Compare(a,b,StringComparison.OrdinalIgnoreCase)); using var q = c.CreateCommand(); q.CommandText = "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;"; q.ExecuteNonQuery(); return c; }
    public void Initialize()
    {
        using var c = Open(); using var q = c.CreateCommand(); q.CommandText = """
 PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
 INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL,totp TEXT,recovery TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,userId TEXT NOT NULL,csrf TEXT NOT NULL,expires TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,parent TEXT,name TEXT NOT NULL COLLATE NOCASE,kind TEXT NOT NULL,blob TEXT,size INTEGER NOT NULL DEFAULT 0,checksum TEXT,revision INTEGER NOT NULL DEFAULT 1,modified TEXT NOT NULL,deleted TEXT,favorite INTEGER NOT NULL DEFAULT 0,tags TEXT NOT NULL DEFAULT '',album TEXT NOT NULL DEFAULT '');
 CREATE UNIQUE INDEX IF NOT EXISTS item_name ON items(COALESCE(parent,''),name) WHERE deleted IS NULL;
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,itemId TEXT NOT NULL,blob TEXT NOT NULL,size INTEGER NOT NULL,checksum TEXT NOT NULL,created TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,userId TEXT NOT NULL,parent TEXT,name TEXT NOT NULL,itemId TEXT,total INTEGER NOT NULL,offset INTEGER NOT NULL DEFAULT 0,expected TEXT,created TEXT NOT NULL,committed TEXT,baseRevision INTEGER);
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,modified TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS record_versions(id TEXT PRIMARY KEY,recordId TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,modified TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,itemId TEXT NOT NULL,userId TEXT,token TEXT,password TEXT,expires TEXT,write INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,token TEXT UNIQUE,folder TEXT,mode TEXT NOT NULL,expires TEXT,pair TEXT,lastSeen TEXT,paused INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT);
 CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,type UNINDEXED,title,content,tags);
 """; q.ExecuteNonQuery();
        if (Convert.ToInt32(Scalar("SELECT version FROM schema_version")) != 1) throw new InvalidOperationException("Unsupported database schema; restore the previous application version. Database was not reset.");
    }
    public object? Scalar(string sql, params (string, object?)[] args) { using var c = Open(); using var q = Command(c, sql, args); var r = q.ExecuteScalar(); return r is DBNull ? null : r; }
    public int Execute(string sql, params (string, object?)[] args) { using var c = Open(); using var q = Command(c, sql, args); return q.ExecuteNonQuery(); }
    public List<Dictionary<string, object?>> Rows(string sql, params (string, object?)[] args) { using var c = Open(); using var q = Command(c, sql, args); using var r = q.ExecuteReader(); var rows = new List<Dictionary<string, object?>>(); while (r.Read()) { var d = new Dictionary<string, object?>(); for (int i = 0; i < r.FieldCount; i++) d[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i); rows.Add(d); } return rows; }
    public static SqliteCommand Command(SqliteConnection c, string sql, params (string, object?)[] args) { var q = c.CreateCommand(); q.CommandText = sql; foreach (var (k, v) in args) q.Parameters.AddWithValue(k, v ?? DBNull.Value); return q; }
    public void Transaction(Action<SqliteConnection> action) { using var c = Open(); using var t = c.BeginTransaction(); action(c); t.Commit(); }
    public static void Exec(SqliteConnection c, string sql, params (string, object?)[] args) { using var q = Command(c, sql, args); q.ExecuteNonQuery(); }
    public void Audit(string actor, string action, string? target = null) => Execute("INSERT INTO audit(time,actor,action,target) VALUES($t,$a,$x,$id)", ("$t", Now), ("$a", actor), ("$x", action), ("$id", target));
    public void Job(string type, string payload) => Execute("INSERT INTO jobs(id,type,payload,state,created,updated) VALUES($id,$t,$p,'pending',$n,$n)", ("$id", Guid.NewGuid().ToString("N")), ("$t", type), ("$p", payload), ("$n", Now));
    public static string Now => DateTimeOffset.UtcNow.ToString("O");
    public string Setting(string key, string fallback = "") { var value = Scalar("SELECT value FROM settings WHERE key=$k", ("$k", key)); return value == null ? fallback : Convert.ToString(value)!; }
    public void Set(string key, string value) => Execute("INSERT INTO settings VALUES($k,$v) ON CONFLICT(key) DO UPDATE SET value=$v", ("$k", key), ("$v", value));
}

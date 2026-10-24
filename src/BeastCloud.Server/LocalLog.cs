using Microsoft.Extensions.Logging;
namespace BeastCloud;

public sealed class LocalLog(string path) : ILoggerProvider
{
    readonly string directory = path;
    readonly object gate = new(); public ILogger CreateLogger(string name) => new Writer(this, name); public void Dispose() { }
    sealed class Writer(LocalLog parent, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Warning;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) { if (!IsEnabled(level)) return; lock (parent.gate) { try { var path = Path.Combine(parent.directory, "operations-" + DateTime.UtcNow.ToString("yyyyMMdd") + ".log"); if (File.Exists(path) && new FileInfo(path).Length > 10 * 1024 * 1024) { File.Move(path, path + ".previous", true); } File.AppendAllText(path, $"{Database.Now} {level} {category}: {formatter(state, null)}{(exception == null ? "" : " [" + exception.GetType().Name + "]")}\n"); foreach (var old in Directory.GetFiles(parent.directory, "operations-*.log*").Where(f => File.GetLastWriteTimeUtc(f) < DateTime.UtcNow.AddDays(-7))) File.Delete(old); } catch (IOException) {/* A full logging disk must not crash the server. */} } }
    }
}

import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Cloud,
  LayoutDashboard,
  Folder,
  Image as ImageIcon,
  NotebookPen,
  ListTodo,
  CalendarDays,
  Share2,
  Monitor,
  Database,
  Activity,
  Settings,
  Search,
  Plus,
  Upload,
  ChevronRight,
  ArrowUpRight,
  ArrowDownToLine,
  MoreHorizontal,
  ShieldCheck,
  HardDrive,
  Check,
  Trash2,
  RotateCcw,
  Star,
  X,
  Menu,
  Sun,
  Moon,
  LogOut,
  Grid2X2,
  List,
  FileText,
  File,
  RefreshCw,
  Clock,
  Copy,
  Link,
  AlertTriangle,
  Play,
  Pause,
  ArrowLeft,
  ChevronLeft,
  CheckCircle2,
  Lock,
  Tag,
} from "lucide-react";
import {
  api,
  setCsrf,
  uid,
  bytes,
  date,
  upload,
  occurrences,
  zonedISO,
  localEventTime,
} from "./api";
import "./style.css";
type Item = Record<string, any>;
const Ctx = createContext<{
  notify: (s: string) => void;
  nav: (s: string) => void;
  refresh: () => void;
}>({ notify: () => {}, nav: () => {}, refresh: () => {} });
const useApp = () => useContext(Ctx);
const navItems = [
  ["Dashboard", LayoutDashboard],
  ["Files", Folder],
  ["Photos", ImageIcon],
  ["Notes", NotebookPen],
  ["Tasks", ListTodo],
  ["Calendar", CalendarDays],
  ["Shared items", Share2],
  ["Devices", Monitor],
  ["Backups", Database],
  ["Activity", Activity],
  ["Settings", Settings],
] as const;
function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props}>{children}</button>;
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  icon: Icon = Folder,
  title,
  children,
}: {
  icon?: any;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Badge({
  children,
  good = false,
}: {
  children: React.ReactNode;
  good?: boolean;
}) {
  return <span className={"badge " + (good ? "good" : "")}>{children}</span>;
}
function useLoad(path: string, deps: any[] = []) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    api(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, version, ...deps]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      <AlertTriangle size={18} />
      {message}
    </div>
  ) : null;
}
function Auth({ setup, done }: { setup: boolean; done: (u: any) => void }) {
  const [mode, setMode] = useState(setup ? "setup" : "login");
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [pending, setPending] = useState<any>();
  return (
    <main className="auth">
      <div className="auth-brand">
        <Cloud /> BeastCloud
      </div>
      <div className="auth-card">
        <span className="eyebrow">YOUR SPACE. YOUR RULES.</span>
        <h1>
          {mode === "setup"
            ? "Make yourself at home."
            : mode === "recover"
              ? "Recover your account."
              : "Welcome home."}
        </h1>
        <p>
          Your files, your memories, your everyday. All on your own hardware.
        </p>
        {codes.length ? (
          <>
            <h3>Save your recovery codes</h3>
            <p>
              Each code works once. Store these somewhere safe outside
              BeastCloud.
            </p>
            <pre className="codes">{codes.join("\n")}</pre>
            <button className="primary" onClick={() => done(pending)}>
              I saved my codes · Open BeastCloud
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const j = Object.fromEntries(new FormData(e.currentTarget));
              try {
                if (mode === "setup") {
                  const r = await api("/setup", "POST", {
                    ...j,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  });
                  setCsrf(r.session.csrf);
                  setPending(r.session);
                  setCodes(r.recoveryCodes);
                } else if (mode === "recover") {
                  await api("/recover", "POST", j);
                  setMode("login");
                  setError("Password reset. Sign in with your new password.");
                } else done(await api("/login", "POST", j));
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            {mode === "setup" && (
              <label>
                Local setup key
                <input name="key" required autoComplete="off" />
                <small>
                  Read config\setup.key on the server. Setup only accepts local
                  connections.
                </small>
              </label>
            )}
            <label>
              Account name
              <input
                name="name"
                autoComplete="username"
                required
                maxLength={180}
              />
            </label>
            <label>
              {mode === "recover" ? "New password" : "Password"}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </label>
            {mode !== "setup" && (
              <label>
                {mode === "recover"
                  ? "Recovery code"
                  : "Authenticator or recovery code (if enabled)"}
                <input
                  name="code"
                  autoComplete="one-time-code"
                  required={mode === "recover"}
                />
              </label>
            )}
            <ErrorBox message={error} />
            <button className="primary" type="submit">
              {mode === "setup"
                ? "Create my private cloud"
                : mode === "recover"
                  ? "Reset password"
                  : "Unlock BeastCloud"}
              <ArrowUpRight size={18} />
            </button>
            {!setup && (
              <button
                type="button"
                className="text-button"
                onClick={() => setMode(mode === "login" ? "recover" : "login")}
              >
                {mode === "login" ? "Use a recovery code" : "Back to sign in"}
              </button>
            )}
          </form>
        )}
        <div className="auth-foot">
          <ShieldCheck size={16} /> Local by design. Private by default.
        </div>
      </div>
    </main>
  );
}
function App() {
  const [session, setSession] = useState<any>(null);
  const [bootstrap, setBootstrap] = useState<any>(null);
  const [page, setPage] = useState("Dashboard");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api("/bootstrap").then(setBootstrap);
    api("/session")
      .then((u) => {
        setCsrf(u.csrf);
        setSession(u);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function nav(s: string) {
    setPage(s);
    setMobile(false);
    setSearchQuery("");
  }
  if (location.hash.startsWith("#share=")) return <PublicShare />;
  if (!bootstrap)
    return <div className="loading">Connecting to your cloud…</div>;
  if (!session)
    return (
      <Auth
        setup={bootstrap.needsSetup}
        done={(u) => {
          setCsrf(u.csrf);
          setSession(u);
          setBootstrap({ needsSetup: false });
        }}
      />
    );
  return (
    <Ctx.Provider
      value={{ notify: setToast, nav, refresh: () => setTick((t) => t + 1) }}
    >
      <div className="app-shell">
        <aside className={mobile ? "sidebar open" : "sidebar"}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              nav("Dashboard");
            }}
          >
            <span className="brand-icon">
              <Cloud size={25} />
            </span>
            BeastCloud<span className="brand-dot">•</span>
          </a>
          <div className="workspace">
            <span className="avatar">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{session.name}'s cloud</strong>
              <small>Personal workspace</small>
            </div>
            <ShieldCheck size={16} />
          </div>
          <span className="nav-label">WORKSPACE</span>
          <nav>
            {navItems
              .filter(
                ([name]) => session.role === "owner" || name === "Shared items",
              )
              .map(([name, Icon], i) => (
                <button
                  key={name}
                  className={
                    (page === name && !searchQuery ? "active " : "") +
                    (i === 6 ? "nav-divider" : "")
                  }
                  onClick={() => nav(name)}
                >
                  <Icon size={19} />
                  {name}
                  {name === "Dashboard" && <span className="nav-active-dot" />}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="private-note">
              <ShieldCheck size={18} />
              <span>
                Yours. And only yours.<small>No cloud in your cloud.</small>
              </span>
            </div>
            <button
              onClick={async () => {
                await api("/logout", "POST");
                setSession(null);
              }}
            >
              <LogOut size={17} />
              Sign out
            </button>
            <span className="version">BeastCloud 0.1 · Self-hosted</span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="top-left">
              <button
                className="icon mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu />
              </button>
              <span>My workspace</span>
              <ChevronRight size={14} />
              <strong>{searchQuery ? "Search" : page}</strong>
            </div>
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(search);
              }}
            >
              <Search size={17} />
              <input
                aria-label="Search your cloud"
                placeholder="Search your cloud…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <div className="top-actions">
              <span className="local-status">
                <i />
                Hosted locally
              </span>
              <button
                className="icon"
                aria-label="Toggle theme"
                onClick={() =>
                  setTheme((t) => (t === "dark" ? "light" : "dark"))
                }
              >
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              </button>
              <span className="avatar small">
                {session.name[0].toUpperCase()}
              </span>
            </div>
          </header>
          <main className="content" key={tick}>
            {searchQuery ? (
              <SearchPage query={searchQuery} />
            ) : session.role !== "owner" ? (
              <Shared restricted />
            ) : page === "Dashboard" ? (
              <Dashboard name={session.name} />
            ) : page === "Files" ? (
              <Files />
            ) : page === "Photos" ? (
              <Photos />
            ) : page === "Notes" ? (
              <Records type="note" />
            ) : page === "Tasks" ? (
              <Records type="task" />
            ) : page === "Calendar" ? (
              <CalendarPage />
            ) : page === "Shared items" ? (
              <Shared />
            ) : page === "Devices" ? (
              <Devices />
            ) : page === "Backups" ? (
              <Backups />
            ) : page === "Activity" ? (
              <ActivityPage />
            ) : (
              <SettingsPage />
            )}
          </main>
          <footer className="page-footer">
            <span>
              <Lock size={12} /> A little more peace of mind. A lot more yours.
            </span>
            <span>Stored on your hardware</span>
          </footer>
        </div>
        {toast && (
          <div role="status" className="toast">
            <CheckCircle2 size={20} />
            {toast}
            <button
              className="icon"
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
function Heading({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function FileIcon({ item }: { item: Item }) {
  if (item.kind === "folder")
    return (
      <span className="file-icon folder">
        <Folder size={23} />
      </span>
    );
  const ext = item.name.split(".").pop()?.toLowerCase();
  return (
    <span
      className={
        "file-icon " +
        (["jpg", "png", "jpeg", "webp", "gif"].includes(ext)
          ? "image"
          : ext === "pdf"
            ? "pdf"
            : "")
      }
    >
      {["jpg", "png", "jpeg", "webp", "gif"].includes(ext) ? (
        <ImageIcon size={22} />
      ) : (
        <FileText size={22} />
      )}
    </span>
  );
}
function Dashboard({ name }: { name: string }) {
  const { data: d, error, reload } = useLoad("/dashboard");
  const { nav } = useApp();
  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Heading
        eyebrow="A SPACE THAT'S TRULY YOURS"
        title={`Welcome home, ${name}.`}
        subtitle="Everything that matters. Right where it belongs."
      >
        <button onClick={reload}>
          <RefreshCw size={16} />
          Refresh
        </button>
        <button className="primary" onClick={() => nav("Files")}>
          <Upload size={17} />
          Upload files
        </button>
      </Heading>
      <ErrorBox message={error} />
      {!d ? (
        <div className="loading">Reading your workspace…</div>
      ) : (
        <>
          <div className="welcome-banner">
            <div>
              <Badge good>
                <i /> YOUR PRIVATE CLOUD
              </Badge>
              <h2>A home for your digital life.</h2>
              <p>
                Keep the important things close. Your files, photos, and plans,
                <br className="desktop" /> together on hardware you control.
              </p>
              <button className="text-button" onClick={() => nav("Files")}>
                Explore your files <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="banner-art" aria-hidden="true">
              <div className="orbit o1" />
              <div className="orbit o2" />
              <div className="orbit o3" />
              <div className="art-cloud">
                <Cloud size={74} />
              </div>
              <span className="art-float f1">
                <Folder size={25} />
              </span>
              <span className="art-float f2">
                <ImageIcon size={24} />
              </span>
              <span className="art-float f3">
                <ShieldCheck size={23} />
              </span>
            </div>
          </div>
          {!d.available && (
            <ErrorBox message="Managed storage is unavailable. Reconnect the configured drive; BeastCloud will not replace it with empty storage." />
          )}
          <div className="stat-grid">
            <Stat
              icon={HardDrive}
              label="Storage used"
              value={bytes(d.used)}
              detail={`${bytes(d.free)} available on storage volume`}
              color="mint"
            />
            <Stat
              icon={Folder}
              label="Files in your cloud"
              value={d.files.toLocaleString()}
              detail="Originals, safely in your hands"
            />
            <Stat
              icon={NotebookPen}
              label="Notes & tasks"
              value={(d.notes + d.tasks).toLocaleString()}
              detail={`${d.notes} notes · ${d.tasks} tasks`}
              color="purple"
            />
            <Stat
              icon={ShieldCheck}
              label="Latest backup"
              value={
                d.backups[0]?.state === "completed"
                  ? "Protected"
                  : d.backups[0]?.state || "Not yet"
              }
              detail={
                d.backups[0]
                  ? date(d.backups[0].updated)
                  : "Create your first recovery point"
              }
              color="amber"
            />
          </div>
          <div className="dashboard-columns">
            <section className="panel recent-panel">
              <div className="panel-head">
                <h2>
                  Recent files<span className="count">{d.recent.length}</span>
                </h2>
                <button className="text-button" onClick={() => nav("Files")}>
                  View all files
                  <ArrowUpRight size={15} />
                </button>
              </div>
              {d.recent.length ? (
                <div className="file-table">
                  <div className="file-table-head">
                    <span>Name</span>
                    <span>Last modified</span>
                    <span>Size</span>
                  </div>
                  {d.recent.map((f: Item) => (
                    <div className="recent-row" key={f.id}>
                      <div>
                        <FileIcon item={f} />
                        <span>
                          <strong>{f.name}</strong>
                          <small>
                            {f.kind === "folder"
                              ? "Folder"
                              : f.name.split(".").pop()?.toUpperCase() +
                                " file"}
                          </small>
                        </span>
                      </div>
                      <span>{new Date(f.modified).toLocaleDateString()}</span>
                      <span>{f.kind === "folder" ? "—" : bytes(f.size)}</span>
                      {f.kind === "file" && (
                        <a
                          className="icon"
                          aria-label={"Download " + f.name}
                          href={"/api/items/" + f.id + "/content"}
                        >
                          <ArrowDownToLine size={16} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Your next chapter starts here">
                  Upload your first files to give them a home.
                </Empty>
              )}
              <div className="panel-foot">
                <ShieldCheck size={14} />
                Your originals stay original. Always.
              </div>
            </section>
            <section className="panel activity-panel">
              <div className="panel-head">
                <h2>Cloud activity</h2>
                <span className="live-dot" />
              </div>
              {d.activity.length ? (
                <div className="timeline">
                  {d.activity.slice(0, 5).map((a: Item) => (
                    <div key={a.id}>
                      <span className="timeline-icon">
                        <Activity size={15} />
                      </span>
                      <div>
                        <strong>{a.action.replaceAll(".", " ")}</strong>
                        <small>{date(a.time)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={Activity} title="A fresh start">
                  Your workspace activity appears here.
                </Empty>
              )}
              <button
                className="text-button panel-link"
                onClick={() => nav("Activity")}
              >
                See all activity
                <ArrowUpRight size={15} />
              </button>
            </section>
          </div>
          <div className="dashboard-bottom">
            <section className="panel">
              <div className="panel-head">
                <h2>Make room for what matters</h2>
                <Badge>QUICK ACCESS</Badge>
              </div>
              <div className="quick-grid">
                {[
                  ["Photos", "Your moments, together", ImageIcon, "peach"],
                  ["Notes", "A place for every idea", NotebookPen, "purple"],
                  ["Calendar", "A little more organised", CalendarDays, "mint"],
                ].map(([label, desc, Icon, color]: any) => (
                  <button key={label} onClick={() => nav(label)}>
                    <span className={"quick-icon " + color}>
                      <Icon size={22} />
                    </span>
                    <strong>{label}</strong>
                    <small>{desc}</small>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            </section>
            <section className="panel device-panel">
              <div className="panel-head">
                <h2>Your connected world</h2>
                <Monitor size={18} />
              </div>
              <div className="device-summary">
                <span className="device-illustration">
                  <Monitor size={35} />
                </span>
                <div>
                  <strong>
                    {d.devices.length} paired{" "}
                    {d.devices.length === 1 ? "device" : "devices"}
                  </strong>
                  <small>{d.transfers.length} active transfers</small>
                  <button
                    className="text-button"
                    onClick={() => nav("Devices")}
                  >
                    Manage devices <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Stat({ icon: Icon, label, value, detail, color = "blue" }: any) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <span className={"stat-icon " + color}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Files() {
  const { notify } = useApp();
  const [path, setPath] = useState<Item[]>([]);
  const [trash, setTrash] = useState(false);
  const [grid, setGrid] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [share, setShare] = useState<Item | null>(null);
  const [page, setPage] = useState(0);
  const [transfers, setTransfers] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const parent = path.at(-1)?.id || null;
  const { data, error, reload } = useLoad(
    "/items?" +
      new URLSearchParams({
        ...(!trash ? { parent: parent || "" } : { trash: "true" }),
        page: String(page),
        q: filter,
      }),
  );
  useEffect(() => {
    setSelected([]);
    setPage(0);
  }, [parent, trash, filter]);
  async function action(fn: () => Promise<any>, msg: string) {
    try {
      await fn();
      reload();
      notify(msg);
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function pick(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    const controller = new AbortController();
    abort.current = controller;
    const folders = new Map<string, string>();
    try {
      for (const file of list) {
        let destination = parent;
        const parts = (file.webkitRelativePath || "").split("/").slice(0, -1);
        let prefix = "";
        for (const part of parts) {
          prefix += "/" + part;
          if (!folders.has(prefix)) {
            const existing = await api("/items?parent=" + (destination || ""));
            const found = existing.find(
              (i: Item) => i.name === part && i.kind === "folder",
            );
            const f =
              found ||
              (await api("/folders", "POST", {
                name: part,
                parent: destination,
              }));
            folders.set(prefix, f.id);
          }
          destination = folders.get(prefix)!;
        }
        const key = uid();
        setTransfers((t) => [
          ...t,
          { id: key, name: file.name, progress: 0, state: "uploading" },
        ]);
        try {
          await upload(
            file,
            destination,
            (n) =>
              setTransfers((t) =>
                t.map((i) => (i.id === key ? { ...i, progress: n } : i)),
              ),
            controller.signal,
          );
          setTransfers((t) =>
            t.map((i) => (i.id === key ? { ...i, state: "complete" } : i)),
          );
          reload();
        } catch (e: any) {
          setTransfers((t) =>
            t.map((i) =>
              i.id === key ? { ...i, state: "paused", error: e.message } : i,
            ),
          );
          throw e;
        }
      }
    } catch (e: any) {
      notify(
        e.name === "AbortError"
          ? "Transfer paused. Reselect the same file to resume."
          : e.message,
      );
    } finally {
      abort.current = null;
      if (input.current) input.current.value = "";
    }
  }
  const rows = (data || [])
    .slice()
    .sort((a: Item, b: Item) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "size"
          ? b.size - a.size
          : b.modified.localeCompare(a.modified),
    );
  return (
    <>
      <Heading
        eyebrow="A PLACE FOR EVERYTHING"
        title={trash ? "Trash" : "Your files."}
        subtitle={
          trash
            ? "A second chance for things you let go."
            : "Organised your way. Stored on your terms."
        }
      >
        <button
          onClick={() => {
            setTrash(!trash);
            setPage(0);
          }}
        >
          <Trash2 size={17} />
          {trash ? "Back to files" : "Trash"}
        </button>
        {!trash && (
          <>
            <button
              onClick={() => {
                const name = prompt("Folder name");
                if (name)
                  action(
                    () => api("/folders", "POST", { name, parent }),
                    "Folder created",
                  );
              }}
            >
              <Plus size={17} />
              New folder
            </button>
            <button className="primary" onClick={() => input.current?.click()}>
              <Upload size={17} />
              Upload files
            </button>
          </>
        )}
      </Heading>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "" } as any)}
        onChange={(e) => pick(e.target.files)}
      />
      <ErrorBox message={error} />
      <section
        className="panel files-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!trash) pick(e.dataTransfer.files);
        }}
      >
        <div className="files-toolbar">
          <div className="breadcrumbs">
            <button onClick={() => setPath([])}>
              <Folder size={16} />
              All files
            </button>
            {path.map((p, i) => (
              <React.Fragment key={p.id}>
                <ChevronRight size={14} />
                <button onClick={() => setPath(path.slice(0, i + 1))}>
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="toolbar-right">
            <input
              aria-label="Filter files"
              placeholder="Filter files…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              aria-label="Sort files"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="modified">Recent</option>
              <option value="size">Size</option>
            </select>
            <button
              className="icon"
              onClick={() => setGrid(!grid)}
              aria-label="Toggle file view"
            >
              {grid ? <List size={19} /> : <Grid2X2 size={19} />}
            </button>
            {!trash && (
              <button
                className="icon"
                title="Upload a folder"
                aria-label="Upload a folder"
                onClick={() => folderInput.current?.click()}
              >
                <Folder size={18} />
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <strong>{selected.length} selected</strong>
            {!trash ? (
              <>
                <a
                  className="button"
                  href={"/api/archive?ids=" + selected.join(",")}
                >
                  <ArrowDownToLine size={15} />
                  Download ZIP
                </a>
                <button
                  onClick={() =>
                    action(async () => {
                      if (confirm("Move selected items to trash?")) {
                        for (const id of selected)
                          await api("/items/" + id, "DELETE");
                        setSelected([]);
                      }
                    }, "Selection updated")
                  }
                >
                  <Trash2 size={15} />
                  Move to trash
                </button>
                <button
                  onClick={() => {
                    const destination = prompt(
                      "Destination folder ID (leave empty for root). Find IDs in folder details.",
                    );
                    if (destination !== null)
                      action(async () => {
                        for (const id of selected)
                          await api("/items/" + id, "PATCH", {
                            parent: destination || null,
                          });
                        setSelected([]);
                      }, "Items moved");
                  }}
                >
                  Move
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() =>
                    action(async () => {
                      for (const id of selected)
                        await api("/items/" + id + "/restore", "POST");
                      setSelected([]);
                    }, "Items restored")
                  }
                >
                  <RotateCcw size={15} />
                  Restore
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete selected items? This cannot be undone.",
                      )
                    )
                      action(async () => {
                        for (const id of selected)
                          await api("/trash/" + id, "DELETE");
                        setSelected([]);
                      }, "Items permanently deleted");
                  }}
                >
                  Delete permanently
                </button>
              </>
            )}
          </div>
        )}
        {!data ? (
          <div className="loading">Loading files…</div>
        ) : !rows.length ? (
          <Empty
            title={trash ? "Nothing in the trash" : "Room for something good"}
          >
            Drop files here, or choose Upload files to get started.
          </Empty>
        ) : (
          <div className={grid ? "file-grid" : "file-list"}>
            {!grid && (
              <div className="list-head">
                <input
                  type="checkbox"
                  aria-label="Select all files"
                  checked={selected.length === rows.length}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? rows.map((i: Item) => i.id) : [],
                    )
                  }
                />
                <span>Name</span>
                <span>Modified</span>
                <span>Size</span>
                <span>Actions</span>
              </div>
            )}
            {rows.map((f: Item) => (
              <div
                key={f.id}
                className={
                  "file-row " + (selected.includes(f.id) ? "selected" : "")
                }
              >
                <input
                  type="checkbox"
                  aria-label={"Select " + f.name}
                  checked={selected.includes(f.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, f.id]
                        : s.filter((id) => id !== f.id),
                    )
                  }
                />
                <button
                  className="file-name"
                  onClick={() => {
                    if (f.kind === "folder" && !trash)
                      setPath((p) => [...p, f]);
                    else setDetail(f);
                  }}
                >
                  <FileIcon item={f} />
                  <span>
                    <strong>{f.name}</strong>
                    {f.tags && <small>{f.tags}</small>}
                  </span>
                  {!!f.favorite && <Star size={13} className="star" />}
                </button>
                <span className="muted">
                  {new Date(f.modified).toLocaleDateString()}
                </span>
                <span className="muted">
                  {f.kind === "folder" ? "—" : bytes(f.size)}
                </span>
                <div className="row-actions">
                  {!trash && f.kind === "file" && (
                    <>
                      <a
                        href={"/api/items/" + f.id + "/content"}
                        aria-label={"Download " + f.name}
                        className="icon"
                      >
                        <ArrowDownToLine size={16} />
                      </a>
                      <button
                        className="icon"
                        aria-label={"Share " + f.name}
                        onClick={() => setShare(f)}
                      >
                        <Share2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon"
                    aria-label={"Details for " + f.name}
                    onClick={() => setDetail(f)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pagination">
          <span>{rows.length} items on this page</span>
          <div>
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={15} />
              Previous
            </button>
            <button
              disabled={rows.length < 200}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      {transfers.length > 0 && (
        <section className="panel transfers">
          <div className="panel-head">
            <h2>Transfers</h2>
            <button
              onClick={() => abort.current?.abort()}
              disabled={!abort.current}
            >
              <Pause size={16} />
              Pause uploads
            </button>
          </div>
          {transfers.map((t) => (
            <div key={t.id}>
              <span>{t.name}</span>
              <progress max={1} value={t.progress} />
              <small>
                {t.state === "complete"
                  ? "Committed"
                  : t.state === "paused"
                    ? "Paused · reselect to resume"
                    : Math.round(t.progress * 100) + "%"}
              </small>
            </div>
          ))}
        </section>
      )}
      {detail && (
        <Details
          item={detail}
          close={() => {
            setDetail(null);
            reload();
          }}
        />
      )}
      {share && <ShareDialog item={share} close={() => setShare(null)} />}
    </>
  );
}
function Details({ item: i, close }: { item: Item; close: () => void }) {
  const { notify } = useApp();
  const { data: versions, reload } = useLoad("/items/" + i.id + "/versions");
  const [error, setError] = useState("");
  const replacement = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  async function run(fn: () => Promise<any>, message: string) {
    try {
      await fn();
      notify(message);
      close();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Modal title={i.name} close={close}>
      <ErrorBox message={error} />
      {i.kind === "file" && !i.deleted && (
        <div className="preview">
          {["jpg", "jpeg", "png", "gif", "webp"].includes(
            i.name.split(".").pop().toLowerCase(),
          ) ? (
            <img
              src={"/api/items/" + i.id + "/content?preview=true"}
              alt={i.name}
            />
          ) : ["mp4", "webm"].includes(i.name.split(".").pop()) ? (
            <video
              controls
              src={"/api/items/" + i.id + "/content?preview=true"}
            />
          ) : ["mp3", "wav", "ogg"].includes(i.name.split(".").pop()) ? (
            <audio
              controls
              src={"/api/items/" + i.id + "/content?preview=true"}
            />
          ) : ["txt", "md", "csv", "log"].includes(i.name.split(".").pop()) ? (
            <TextPreview id={i.id} />
          ) : i.name.endsWith(".pdf") ? (
            <a
              href={"/api/items/" + i.id + "/content?preview=true"}
              target="_blank"
              rel="noreferrer"
            >
              Open local PDF preview
            </a>
          ) : (
            <p>
              Preview unavailable for this format. Download the original to open
              it locally.
            </p>
          )}
        </div>
      )}
      <dl>
        <dt>Identity</dt>
        <dd className="mono">{i.id}</dd>
        <dt>Size</dt>
        <dd>{bytes(i.size)}</dd>
        <dt>Modified</dt>
        <dd>{date(i.modified)}</dd>
        <dt>Revision</dt>
        <dd>{i.revision}</dd>
        {i.checksum && (
          <>
            <dt>SHA-256</dt>
            <dd className="mono">{i.checksum}</dd>
          </>
        )}
      </dl>
      {!i.deleted && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  api(
                    "/items/" + i.id,
                    "PATCH",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  ),
                "Details saved",
              );
            }}
          >
            <label>
              Name
              <input name="name" defaultValue={i.name} required />
            </label>
            <label>
              Tags (comma separated)
              <input name="tags" defaultValue={i.tags} />
            </label>
            {i.kind === "file" && (
              <label>
                Photo album
                <input name="album" defaultValue={i.album} />
              </label>
            )}
            <button className="primary">Save details</button>
          </form>
          <div className="button-row">
            <button
              onClick={() =>
                run(
                  () =>
                    api("/items/" + i.id, "PATCH", { favorite: !i.favorite }),
                  i.favorite
                    ? "Removed from favourites"
                    : "Added to favourites",
                )
              }
            >
              <Star size={16} />
              Favourite
            </button>
            {
              <>
                <button
                  onClick={() => {
                    const name = prompt("Copy name", i.name + " copy");
                    if (name)
                      run(
                        () =>
                          api("/items/" + i.id + "/copy", "POST", {
                            name,
                            parent: i.parent,
                          }),
                        "File copied",
                      );
                  }}
                >
                  <Copy size={16} />
                  Copy
                </button>
                <button
                  disabled={i.kind !== "file"}
                  onClick={() => replacement.current?.click()}
                >
                  <Upload size={16} />
                  New version
                </button>
                <input
                  hidden
                  ref={replacement}
                  type="file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      run(
                        () =>
                          upload(
                            f,
                            i.parent,
                            setProgress,
                            new AbortController().signal,
                            i,
                          ),
                        "New version committed",
                      );
                  }}
                />
                {progress > 0 && <small>{Math.round(progress * 100)}%</small>}
              </>
            }
          </div>
        </>
      )}
      <h3>Version history</h3>
      {versions?.length ? (
        versions.map((v: Item) => (
          <div className="version-row" key={v.id}>
            <span>
              Revision {v.revision}
              <small>
                {date(v.created)} · {bytes(v.size)}
              </small>
            </span>
            <button
              disabled={!!i.deleted}
              onClick={async () => {
                try {
                  await api(
                    "/items/" + i.id + "/versions/" + v.id + "/restore",
                    "POST",
                  );
                  notify("Version restored");
                  reload();
                  close();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <RotateCcw size={15} />
              Restore
            </button>
          </div>
        ))
      ) : (
        <p className="muted">
          Previous versions appear when a file is replaced.
        </p>
      )}
    </Modal>
  );
}
function TextPreview({ id }: { id: string }) {
  const [text, setText] = useState("Loading…");
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/items/" + id + "/content?preview=true", { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Preview unavailable");
        const reader = r.body!.getReader();
        const chunk = await reader.read();
        await reader.cancel();
        setText(new TextDecoder().decode(chunk.value).slice(0, 65536));
      })
      .catch((e) => setText(e.message));
    return () => ac.abort();
  }, [id]);
  return <pre>{text}</pre>;
}
function ShareDialog({ item, close }: { item: Item; close: () => void }) {
  const { data: users } = useLoad("/users");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title={"Share " + item.name} close={close}>
      <p>
        Only people who can reach this server can use a share. Creating a link
        does not publish your server.
      </p>
      {result ? (
        <>
          <label>
            Share link
            <input readOnly value={result} onFocus={(e) => e.target.select()} />
          </label>
          <p>Copy this now. The secret cannot be shown again.</p>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const r = await api("/shares", "POST", {
                itemId: item.id,
                userId: f.userId || null,
                password: f.password || null,
                expires: f.expires
                  ? new Date(String(f.expires)).toISOString()
                  : null,
                write: f.write === "on",
              });
              setResult(
                r.token
                  ? location.origin + "/#share=" + r.token
                  : "Access granted to the selected local account.",
              );
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <label>
            Share with
            <select name="userId">
              <option value="">Anyone with a secret link (read-only)</option>
              {users
                ?.filter((u: Item) => u.role !== "owner")
                .map((u: Item) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Optional link password (12+ characters)
            <input name="password" type="password" minLength={12} />
          </label>
          <label>
            Expires (optional)
            <input name="expires" type="datetime-local" />
          </label>
          <label className="check-label">
            <input name="write" type="checkbox" />
            Allow a local account to replace this file (up to 4 MiB)
          </label>
          <ErrorBox message={error} />
          <button className="primary">
            <Link size={16} />
            Create share
          </button>
        </form>
      )}
    </Modal>
  );
}
function PublicShare() {
  const [error, setError] = useState("");
  return (
    <main className="auth">
      <div className="auth-card">
        <Cloud size={36} />
        <h1>A file, just for you.</h1>
        <p>Shared privately through BeastCloud.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const password = new FormData(e.currentTarget).get("password");
              const r = await fetch("/api/public/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token: location.hash.slice(7),
                  password,
                }),
              });
              if (!r.ok)
                throw Error(
                  "Share unavailable, expired, or password incorrect",
                );
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = decodeURIComponent(
                r.headers
                  .get("content-disposition")
                  ?.match(/filename\*=UTF-8''([^;]+)/)?.[1] || "shared-file",
              );
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <label>
            Share password (if required)
            <input name="password" type="password" />
          </label>
          <ErrorBox message={error} />
          <button className="primary">
            <ArrowDownToLine size={17} />
            Download original
          </button>
        </form>
      </div>
    </main>
  );
}
function Photos() {
  const [album, setAlbum] = useState("");
  const [detail, setDetail] = useState<Item | null>(null);
  const { data, error, reload } = useLoad(
    "/media?album=" + encodeURIComponent(album),
  );
  return (
    <>
      <Heading
        eyebrow="THE MOMENTS THAT MATTER"
        title="Your memories."
        subtitle="Original quality. Local previews. A lifetime of your own."
      >
        <label className="inline-label">
          Album
          <input
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            placeholder="All albums"
          />
        </label>
      </Heading>
      <ErrorBox message={error} />
      {data?.length ? (
        <div className="photo-grid">
          {data.map((i: Item) => (
            <button key={i.id} onClick={() => setDetail(i)}>
              <img
                src={"/api/items/" + i.id + "/thumbnail"}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <ImageIcon className="photo-fallback" />
              <span>
                <strong>{i.name}</strong>
                <small>
                  {new Date(i.modified).toLocaleDateString()}
                  {i.album ? " · " + i.album : ""}
                </small>
              </span>
              {!!i.favorite && <Star className="photo-star" size={18} />}
            </button>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty icon={ImageIcon} title="Good memories belong here">
            Upload JPG, PNG, WebP, or GIF files in Files. Add an album in file
            details. MP4 and WebM previews are also supported.
          </Empty>
        </section>
      )}
      {detail && (
        <Details
          item={detail}
          close={() => {
            setDetail(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function Records({ type }: { type: "note" | "task" }) {
  const { notify } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<Item | null>(null);
  const { data, error, reload } = useLoad(
    "/records?type=" + type + "&q=" + encodeURIComponent(query),
  );
  const records = (data || [])
    .map((r: Item) => ({ ...r, body: JSON.parse(r.body) }))
    .filter(
      (r: Item) =>
        type === "note" ||
        filter === "all" ||
        (filter === "done" ? r.body.done : !r.body.done),
    );
  const create = () =>
    setEdit({
      id: uid(),
      type,
      title: "",
      revision: 0,
      body: {
        text: "",
        tags: "",
        attachments: "",
        list: "Personal",
        priority: "normal",
        due: "",
        done: false,
      },
    });
  return (
    <>
      <Heading
        eyebrow={
          type === "note" ? "LET YOUR IDEAS BREATHE" : "ONE THING AT A TIME"
        }
        title={type === "note" ? "Your notebook." : "A clearer day."}
        subtitle={
          type === "note"
            ? "A quiet space for thoughts, plans, and everything in between."
            : "Big plans, little wins. Make space for both."
        }
      >
        <a className="button" href="/api/records/export">
          <ArrowDownToLine size={16} />
          Export records
        </a>
        <button className="primary" onClick={create}>
          <Plus size={17} />
          New {type}
        </button>
      </Heading>
      <div className="section-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label={"Search " + type + "s"}
            placeholder={"Search " + type + "s…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {type === "task" && (
          <select
            aria-label="Task status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All tasks</option>
            <option value="open">Open tasks</option>
            <option value="done">Completed</option>
          </select>
        )}
        <span className="muted">
          {records.length} {type}s
        </span>
      </div>
      <ErrorBox message={error} />
      {!records.length ? (
        <section className="panel">
          <Empty
            icon={type === "note" ? NotebookPen : ListTodo}
            title={
              type === "note"
                ? "Start with a thought"
                : "A fresh list, a fresh start"
            }
          >
            Create your first {type}. It stays right here, with you.
          </Empty>
        </section>
      ) : type === "note" ? (
        <div className="note-grid">
          {records.map((r: Item) => (
            <button className="note-card" key={r.id} onClick={() => setEdit(r)}>
              <NotebookPen size={20} />
              <h2>{r.title}</h2>
              <p>{r.body.text?.slice(0, 200) || "No content yet"}</p>
              <div>
                <span>{r.body.tags || "Personal note"}</span>
                <small>{new Date(r.modified).toLocaleDateString()}</small>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="panel task-list">
          {records.map((r: Item) => (
            <div key={r.id} className={r.body.done ? "done" : ""}>
              <input
                aria-label={"Complete " + r.title}
                type="checkbox"
                checked={!!r.body.done}
                onChange={async (e) => {
                  try {
                    await api("/records/" + r.id, "PUT", {
                      ...r,
                      body: { ...r.body, done: e.target.checked },
                    });
                    reload();
                  } catch (e: any) {
                    notify(e.message);
                  }
                }}
              />
              <button onClick={() => setEdit(r)}>
                <strong>{r.title}</strong>
                <small>
                  {r.body.list || "Personal"}
                  {r.body.due ? " · Due " + r.body.due : ""}
                </small>
              </button>
              <Badge>{r.body.priority || "normal"}</Badge>
              <button
                className="icon"
                aria-label={"Delete " + r.title}
                onClick={async () => {
                  if (confirm("Delete this task?")) {
                    await api("/records/" + r.id, "DELETE");
                    reload();
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
      {edit && (
        <RecordEditor
          record={edit}
          close={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function RecordEditor({ record, close }: { record: Item; close: () => void }) {
  const { notify } = useApp();
  const [r, setR] = useState(record);
  const [status, setStatus] = useState("Not saved");
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<Item[] | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const current = useRef(r);
  current.current = r;
  const update = (key: string, value: any, body = false) => {
    dirty.current = true;
    setR((v) =>
      body
        ? { ...v, body: { ...v.body, [key]: value } }
        : { ...v, [key]: value },
    );
    setStatus("Unsaved changes");
  };
  async function save() {
    if (saving.current) return false;
    saving.current = true;
    const snapshot = current.current;
    try {
      const result = await api("/records/" + r.id, "PUT", snapshot);
      dirty.current =
        JSON.stringify(current.current) !== JSON.stringify(snapshot);
      setR((v) => ({ ...v, revision: result.revision }));
      setStatus(dirty.current ? "Unsaved changes" : "Saved locally");
      setError("");
      return !dirty.current;
    } catch (e: any) {
      setError(e.message);
      setStatus("Save failed");
      return false;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (r.type !== "note") return;
    const t = setTimeout(() => {
      if (dirty.current && r.title.trim()) save();
    }, 1200);
    return () => clearTimeout(t);
  }, [r]);
  return (
    <Modal
      title={
        r.type === "note"
          ? "Your note"
          : r.type === "event"
            ? "Calendar event"
            : "Task details"
      }
      close={() => {
        if (!dirty.current || confirm("Discard unsaved changes?")) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save()) {
            notify("Saved locally");
            close();
          }
        }}
      >
        <label>
          Title
          <input
            autoFocus
            value={r.title}
            required
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        {r.type === "note" ? (
          <>
            <label>
              Markdown
              <textarea
                className="note-editor"
                value={r.body.text || ""}
                onChange={(e) => update("text", e.target.value, true)}
              />
            </label>
            <div className="save-state">
              <ShieldCheck size={14} />
              {status}
            </div>
            <label>
              Tags
              <input
                value={r.body.tags || ""}
                onChange={(e) => update("tags", e.target.value, true)}
              />
            </label>
            <label>
              Attached file IDs (comma separated)
              <input
                value={r.body.attachments || ""}
                onChange={(e) => update("attachments", e.target.value, true)}
              />
            </label>
            <div className="button-row">
              {r.body.attachments
                ?.split(",")
                .filter(Boolean)
                .map((id: string) => (
                  <a
                    className="button"
                    key={id}
                    href={"/api/items/" + id.trim() + "/content"}
                  >
                    Download attachment
                  </a>
                ))}
            </div>
          </>
        ) : r.type === "task" ? (
          <>
            <label>
              List
              <input
                value={r.body.list || ""}
                onChange={(e) => update("list", e.target.value, true)}
              />
            </label>
            <div className="form-grid">
              <label>
                Due date
                <input
                  type="date"
                  value={r.body.due || ""}
                  onChange={(e) => update("due", e.target.value, true)}
                />
              </label>
              <label>
                Priority
                <select
                  value={r.body.priority || "normal"}
                  onChange={(e) => update("priority", e.target.value, true)}
                >
                  <option>low</option>
                  <option>normal</option>
                  <option>high</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                value={r.body.text || ""}
                onChange={(e) => update("text", e.target.value, true)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!r.body.done}
                onChange={(e) => update("done", e.target.checked, true)}
              />
              Completed
            </label>
          </>
        ) : (
          <>
            <label>
              Event timezone
              <input
                value={r.body.timezone}
                onChange={(e) => update("timezone", e.target.value, true)}
                required
              />
            </label>
            <p className="muted">
              Enter times in the event timezone. Recurrences use a fixed UTC
              time; daylight-saving changes do not shift stored instants.
            </p>
            <div className="form-grid">
              <label>
                Start
                <input
                  type="datetime-local"
                  value={localEventTime(r.body.start, r.body.timezone)}
                  required
                  onChange={(e) => {
                    try {
                      update(
                        "start",
                        zonedISO(e.target.value, r.body.timezone),
                        true,
                      );
                    } catch {
                      setError("Enter a valid timezone");
                    }
                  }}
                />
              </label>
              <label>
                End
                <input
                  type="datetime-local"
                  value={localEventTime(r.body.end, r.body.timezone)}
                  required
                  onChange={(e) => {
                    try {
                      update(
                        "end",
                        zonedISO(e.target.value, r.body.timezone),
                        true,
                      );
                    } catch {
                      setError("Enter a valid timezone");
                    }
                  }}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Repeat
                <select
                  value={r.body.repeat || "none"}
                  onChange={(e) => update("repeat", e.target.value, true)}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily (UTC)</option>
                  <option value="weekly">Weekly (UTC)</option>
                  <option value="monthly">Monthly (clamp to last day)</option>
                </select>
              </label>
              <label>
                Occurrences
                <input
                  type="number"
                  min={1}
                  max={366}
                  value={r.body.count || 1}
                  onChange={(e) =>
                    update("count", Number(e.target.value), true)
                  }
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                value={r.body.text || ""}
                onChange={(e) => update("text", e.target.value, true)}
              />
            </label>
          </>
        )}
        <ErrorBox message={error} />
        <div className="button-row">
          <button className="primary" type="submit">
            <Check size={16} />
            Save {r.type}
          </button>
          {r.revision > 0 && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm("Delete this " + r.type + "?")) {
                  await api("/records/" + r.id, "DELETE");
                  close();
                }
              }}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
          {r.type === "note" && r.revision > 0 && (
            <button
              type="button"
              onClick={async () =>
                setVersions(await api("/records/" + r.id + "/versions"))
              }
            >
              <Clock size={16} />
              Revisions
            </button>
          )}
        </div>
      </form>
      {versions && (
        <div>
          <h3>Recover a revision</h3>
          {versions.length ? (
            versions.map((v) => (
              <div className="version-row" key={v.id}>
                <span>{date(v.modified)}</span>
                <button
                  onClick={() => {
                    dirty.current = true;
                    setR((s) => ({
                      ...s,
                      title: v.title,
                      body: JSON.parse(v.body),
                    }));
                    setVersions(null);
                  }}
                >
                  Load revision
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No earlier revisions.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
function CalendarPage() {
  const { notify } = useApp();
  const [view, setView] = useState("month");
  const [focus, setFocus] = useState(new Date());
  const [edit, setEdit] = useState<Item | null>(null);
  const { data, error, reload } = useLoad("/records?type=event");
  const from = new Date(focus);
  if (view === "month") from.setDate(1);
  if (view === "week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  from.setHours(0, 0, 0, 0);
  const end = new Date(from);
  if (view === "month") end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (view === "week" ? 7 : 1));
  const events = (data || []).flatMap((r: Item) => occurrences(r, from, end));
  const [reminders, setReminders] = useState<Item[]>([]);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      setReminders(
        (data || [])
          .flatMap((r: Item) =>
            occurrences(r, new Date(+now - 60000), new Date(+now + 15 * 60000)),
          )
          .filter((e: Item) => e.start >= now),
      );
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [data]);
  function newEvent() {
    const start = new Date(focus);
    start.setHours(9, 0, 0, 0);
    setEdit({
      id: uid(),
      type: "event",
      title: "",
      revision: 0,
      body: {
        start: start.toISOString(),
        end: new Date(+start + 3600000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        repeat: "none",
        count: 1,
        text: "",
      },
    });
  }
  const days = Array.from(
    {
      length:
        view === "month"
          ? new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate()
          : view === "week"
            ? 7
            : 1,
    },
    (_, i) => {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      return d;
    },
  );
  return (
    <>
      <Heading
        eyebrow="SPACE FOR YOUR DAYS"
        title="Your calendar."
        subtitle="A local place for plans, milestones, and things to look forward to."
      >
        <a className="button" href="/api/calendar/export">
          <ArrowDownToLine size={16} />
          Export iCalendar
        </a>
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".ics";
            input.onchange = async () => {
              try {
                const f = input.files?.[0];
                if (f) {
                  const r = await api("/calendar/import", "POST", {
                    text: await f.text(),
                  });
                  notify(r.imported + " events imported");
                  reload();
                }
              } catch (e: any) {
                notify(e.message);
              }
            };
            input.click();
          }}
        >
          Import
        </button>
        <button className="primary" onClick={newEvent}>
          <Plus size={17} />
          New event
        </button>
      </Heading>
      <ErrorBox message={error} />
      {reminders.length > 0 && (
        <div className="reminder">
          <Clock size={18} />
          Coming up:{" "}
          {reminders
            .map(
              (e) =>
                e.title +
                " at " +
                e.start.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
            )
            .join(" · ")}
        </div>
      )}
      <section className="panel">
        <div className="calendar-toolbar">
          <div>
            <button
              className="icon"
              aria-label="Previous period"
              onClick={() => {
                const d = new Date(focus);
                view === "month"
                  ? d.setMonth(d.getMonth() - 1)
                  : d.setDate(d.getDate() - (view === "week" ? 7 : 1));
                setFocus(d);
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>
              {focus.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
                ...(view !== "month" ? { day: "numeric" } : {}),
              })}
            </h2>
            <button
              className="icon"
              aria-label="Next period"
              onClick={() => {
                const d = new Date(focus);
                view === "month"
                  ? d.setMonth(d.getMonth() + 1)
                  : d.setDate(d.getDate() + (view === "week" ? 7 : 1));
                setFocus(d);
              }}
            >
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setFocus(new Date())}>Today</button>
          </div>
          <select
            aria-label="Calendar view"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>
        </div>
        <div className={"calendar-grid " + view}>
          {view === "month" &&
            Array.from({ length: (from.getDay() + 6) % 7 }, (_, i) => (
              <div className="calendar-day blank" key={"blank" + i} />
            ))}
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={
                "calendar-day " +
                (day.toDateString() === new Date().toDateString()
                  ? "today"
                  : "")
              }
            >
              <span>
                {day.toLocaleDateString(undefined, {
                  day: "numeric",
                  ...(view !== "month" ? { weekday: "short" } : {}),
                })}
              </span>
              {events
                .filter(
                  (e: Item) => e.start.toDateString() === day.toDateString(),
                )
                .map((e: Item) => (
                  <button
                    key={e.id + e.start.toISOString()}
                    onClick={() => setEdit({ ...e, body: JSON.parse(e.body) })}
                  >
                    <span>
                      {e.start.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {e.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
      <p className="muted helper">
        Reminders appear here up to 15 minutes before an event, while this page
        is open. No external push service is used.
      </p>
      {edit && (
        <RecordEditor
          record={edit}
          close={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function SearchPage({ query }: { query: string }) {
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [after, setAfter] = useState("");
  const [location, setLocation] = useState("");
  const { data, error } = useLoad(
    "/search?" + new URLSearchParams({ q: query, type, tag, after, location }),
  );
  return (
    <>
      <Heading
        title={"Search for “" + query + "”"}
        subtitle="Private results from your local index."
      />
      <div className="section-toolbar">
        <select
          aria-label="Content type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All content</option>
          {["file", "note", "task", "event"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          aria-label="Filter by tag"
          placeholder="Tag…"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <input
          aria-label="Folder identity filter"
          placeholder="In folder (identity)…"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          aria-label="Modified after"
          type="date"
          value={after}
          onChange={(e) => setAfter(e.target.value)}
        />
      </div>
      <ErrorBox message={error} />
      <section className="panel search-results">
        {data?.length ? (
          data.map((r: Item) => (
            <div key={r.id}>
              <Badge>{r.type}</Badge>
              <h2>{r.title}</h2>
              <p>{r.content.slice(0, 260)}</p>
              {r.type === "file" ? (
                <a href={"/api/items/" + r.id + "/content"}>
                  Download original
                </a>
              ) : (
                <small>
                  Open{" "}
                  {r.type === "event"
                    ? "Calendar"
                    : r.type === "note"
                      ? "Notes"
                      : "Tasks"}{" "}
                  to edit this result.
                </small>
              )}
            </div>
          ))
        ) : (
          <Empty icon={Search} title="Nothing here just yet">
            Try another phrase. New content is indexed in the background.
          </Empty>
        )}
      </section>
    </>
  );
}
function Shared({ restricted = false }: { restricted?: boolean }) {
  const { notify } = useApp();
  const { data, error, reload } = useLoad(restricted ? "/shared" : "/shares");
  const file = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Item | null>(null);
  return (
    <>
      <Heading
        eyebrow="SHARE WITH INTENTION"
        title="A little connection."
        subtitle="Private sharing, on your terms. Access is always yours to revoke."
      />
      <ErrorBox message={error} />
      <section className="panel">
        {data?.length ? (
          data.map((s: Item) => (
            <div className="share-row" key={s.id}>
              <span className="file-icon">
                <Share2 size={20} />
              </span>
              <div>
                <strong>{s.name}</strong>
                <small>
                  {s.userId
                    ? "Local account"
                    : restricted
                      ? "Shared with you"
                      : "Secret link"}{" "}
                  · {s.expires ? "Expires " + date(s.expires) : "No expiration"}{" "}
                  · {s.write ? "Can replace" : "Read-only"}
                </small>
              </div>
              {restricted ? (
                <>
                  <a
                    className="button"
                    href={"/api/shared/" + s.id + "/content"}
                  >
                    <ArrowDownToLine size={16} />
                    Download
                  </a>
                  {!!s.write && (
                    <button
                      onClick={() => {
                        setTarget(s);
                        file.current?.click();
                      }}
                    >
                      Replace
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="danger"
                  onClick={async () => {
                    try {
                      await api("/shares/" + s.id, "DELETE");
                      reload();
                      notify("Share revoked");
                    } catch (e: any) {
                      notify(e.message);
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty icon={Share2} title="Good things can be shared">
            {restricted
              ? "Files shared with your account appear here."
              : "Choose a file in Files and use Share to create controlled access."}
          </Empty>
        )}
      </section>
      <input
        ref={file}
        type="file"
        hidden
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f || !target) return;
            if (f.size > 4194304)
              throw Error("Shared replacement limit is 4 MiB");
            const data = await f.arrayBuffer();
            const { digest, csrf } = await import("./api");
            const r = await fetch("/api/shared/" + target.id + "/content", {
              method: "PUT",
              headers: {
                "X-CSRF": csrf,
                "Upload-Checksum": await digest(data),
              },
              body: data,
            });
            if (!r.ok) throw Error((await r.json()).error);
            notify("File replaced");
          } catch (e: any) {
            notify(e.message);
          }
        }}
      />
    </>
  );
}
function Devices() {
  const { notify } = useApp();
  const { data, error, reload } = useLoad("/devices");
  const [modal, setModal] = useState(false);
  const [code, setCode] = useState("");
  return (
    <>
      <Heading
        eyebrow="YOUR CLOUD, WITH YOU"
        title="Connected, locally."
        subtitle="Keep selected Windows folders in step. Your devices, your choice."
      >
        <button
          className="primary"
          onClick={() => {
            setModal(true);
            setCode("");
          }}
        >
          <Plus size={17} />
          Pair a device
        </button>
      </Heading>
      <ErrorBox message={error} />
      <section className="panel">
        {data?.length ? (
          data.map((d: Item) => (
            <div className="share-row" key={d.id}>
              <span className="file-icon">
                <Monitor size={24} />
              </span>
              <div>
                <strong>{d.name}</strong>
                <small>
                  {d.mode} · Last seen {date(d.lastSeen)}
                </small>
              </div>
              <Badge good={!d.paused}>{d.paused ? "Paused" : "Enabled"}</Badge>
              <button
                className="icon"
                aria-label={"Pause or resume " + d.name}
                onClick={async () => {
                  await api("/devices/" + d.id, "PATCH", { paused: !d.paused });
                  reload();
                }}
              >
                {d.paused ? <Play size={17} /> : <Pause size={17} />}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (confirm("Revoke this device?")) {
                    await api("/devices/" + d.id, "DELETE");
                    reload();
                    notify("Device revoked");
                  }
                }}
              >
                Revoke
              </button>
            </div>
          ))
        ) : (
          <Empty icon={Monitor} title="Bring your devices together">
            Install the Windows companion from your local package, then pair a
            selected folder.
          </Empty>
        )}
      </section>
      <section className="panel prose">
        <h2>Built for deliberate sync</h2>
        <p>
          The companion synchronises only folders you explicitly select.
          Conflicting edits keep both copies. Deletions stay off unless you
          deliberately enable them. A missing drive pauses reconciliation.
        </p>
        <p>
          See docs/SYNC.md in the package for pairing, Windows startup, ignore
          rules, and recovery. Native mobile backup is outside this release.
        </p>
      </section>
      {modal && (
        <Modal title="Pair a Windows device" close={() => setModal(false)}>
          {code ? (
            <>
              <p>
                This one-time code expires in 10 minutes. Enter it in the
                companion on your device. Do not share it publicly.
              </p>
              <input
                readOnly
                value={code}
                aria-label="Pairing code"
                onFocus={(e) => e.target.select()}
              />
              <p>Companion command:</p>
              <pre>BeastCloud.Sync.exe pair</pre>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const j = Object.fromEntries(new FormData(e.currentTarget));
                  const r = await api("/devices", "POST", j);
                  setCode(r.code);
                  reload();
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              <label>
                Device name
                <input name="name" required placeholder="My Windows laptop" />
              </label>
              <label>
                Server folder identity
                <input
                  name="folder"
                  required
                  placeholder="Copy the folder ID from Files → Details"
                />
              </label>
              <label>
                Direction
                <select name="mode">
                  <option value="two-way">Two-way</option>
                  <option value="upload-only">Upload only</option>
                  <option value="download-only">Download only</option>
                </select>
              </label>
              <button className="primary">Generate pairing code</button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function Backups() {
  const { notify } = useApp();
  const { data, error, reload } = useLoad("/backups");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Heading
        eyebrow="A LITTLE MORE PEACE OF MIND"
        title="Room for a second chance."
        subtitle="Local recovery points. Real integrity checks. Data you can bring home."
      >
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/backups", "POST");
              notify("Backup queued");
              reload();
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Database size={17} />
          Back up now
        </button>
      </Heading>
      <ErrorBox message={error} />
      <div className="info-banner">
        <ShieldCheck size={26} />
        <div>
          <strong>Your backup destination</strong>
          <p className="mono">{data?.destination || "Loading…"}</p>
          <small>
            {data?.available
              ? "Destination is present. Free space and write access are checked by the backup job."
              : "Destination unavailable. Check Settings."}{" "}
            Another folder on the same disk does not protect against disk
            failure.
          </small>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Recovery history</h2>
          <button
            className="icon"
            aria-label="Refresh backups"
            onClick={reload}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {data?.jobs.length ? (
          data.jobs.map((j: Item) => (
            <div className="job-row" key={j.id}>
              <Database size={21} />
              <div>
                <strong>{date(j.created)}</strong>
                <small>
                  {j.state === "completed"
                    ? j.payload
                    : j.error || "Waiting for the local worker"}
                </small>
              </div>
              <Badge good={j.state === "completed"}>{j.state}</Badge>
              {j.state === "failed" && (
                <button
                  onClick={async () => {
                    await api("/jobs/" + j.id + "/retry", "POST");
                    reload();
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty icon={Database} title="Your first recovery point awaits">
            Backups include your database, original files, file versions, and
            local configuration.
          </Empty>
        )}
      </section>
      <section className="panel prose">
        <h2>Recovery you can verify</h2>
        <p>
          Backups pause mutations while SQLite creates a consistent snapshot and
          immutable blobs are copied. Each backup is checksum-verified before
          its job succeeds.
        </p>
        <p>
          Restore into a separate empty folder using scripts/Maintain.ps1.
          Encrypted export is available through the maintenance CLI. Keep your
          passphrase outside this computer; it cannot be recovered.
        </p>
        <p>
          Scheduled backups run while the server is awake. Configure their
          destination and interval in Settings.
        </p>
      </section>
    </>
  );
}
function ActivityPage() {
  const { notify } = useApp();
  const { data, error, reload } = useLoad("/activity");
  const { data: jobs, reload: reloadJobs } = useLoad("/jobs");
  return (
    <>
      <Heading
        title="The everyday, recorded."
        subtitle="A local audit of your cloud, with background work kept in view."
      >
        <button
          onClick={() => {
            reload();
            reloadJobs();
          }}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </Heading>
      <ErrorBox message={error} />
      <section className="panel">
        <div className="panel-head">
          <h2>Background jobs</h2>
        </div>
        {jobs?.slice(0, 15).map((j: Item) => (
          <div className="job-row" key={j.id}>
            <Activity size={18} />
            <div>
              <strong>{j.type}</strong>
              <small>{j.error || date(j.updated)}</small>
            </div>
            <Badge good={j.state === "completed"}>{j.state}</Badge>
            {j.state === "failed" && (
              <button
                onClick={async () => {
                  try {
                    await api("/jobs/" + j.id + "/retry", "POST");
                    reloadJobs();
                  } catch (e: any) {
                    notify(e.message);
                  }
                }}
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Security & activity log</h2>
        </div>
        {data?.map((a: Item) => (
          <div className="audit-row" key={a.id}>
            <span className="timeline-icon">
              <ShieldCheck size={15} />
            </span>
            <div>
              <strong>{a.action.replaceAll(".", " ")}</strong>
              <small>
                {a.target || "Workspace"} · Actor {a.actor.slice(0, 8)}
              </small>
            </div>
            <time>{date(a.time)}</time>
          </div>
        ))}
      </section>
    </>
  );
}
function SettingsPage() {
  const { notify } = useApp();
  const { data, error } = useLoad("/settings");
  const { data: users, reload } = useLoad("/users");
  const [totp, setTotp] = useState<any>(null);
  const [fail, setFail] = useState("");
  return (
    <>
      <Heading
        eyebrow="MAKE IT FEEL LIKE HOME"
        title="Your cloud. Your rules."
        subtitle="Personalise your space and keep the important things protected."
      />
      <ErrorBox message={error || fail} />
      {data && (
        <div className="settings-grid">
          <section className="panel prose">
            <h2>Personal & storage preferences</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    "/settings",
                    "PUT",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  notify("Preferences saved");
                } catch (e: any) {
                  setFail(e.message);
                }
              }}
            >
              {[
                ["displayName", "Display name"],
                ["timezone", "Timezone (IANA or Windows ID)"],
                ["language", "Language preference (interface: English)"],
                ["dateFormat", "Export date preference"],
                [
                  "backupDestination",
                  "Backup destination (must already exist)",
                ],
                ["backupHours", "Backup interval in hours (0 = manual)"],
                [
                  "retentionDays",
                  "Trash and version retention days (0 = indefinitely)",
                ],
                ["backupKeep", "Backups to retain (0 = indefinitely)"],
                ["thumbnailLimit", "Thumbnail cache limit in bytes"],
                ["uploadLimit", "Maximum reserved upload bytes"],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input name={name} defaultValue={data[name]} required />
                </label>
              ))}
              <button className="primary">
                <Check size={17} />
                Save preferences
              </button>
            </form>
          </section>
          <div>
            <section className="panel prose">
              <h2>Storage & access</h2>
              <dl>
                <dt>Managed files</dt>
                <dd className="mono">{data.storage}</dd>
                <dt>Application root</dt>
                <dd className="mono">{data.root}</dd>
                <dt>Network</dt>
                <dd>{data.network}</dd>
              </dl>
              <p>
                Change storage roots and network binding with the local
                maintenance scripts. Reconnect missing volumes before making
                changes. Files are never moved automatically.
              </p>
              <button
                onClick={async () => {
                  await api("/search/rebuild", "POST");
                  notify("Search rebuild queued");
                }}
              >
                <RefreshCw size={16} />
                Rebuild local index
              </button>
              <button
                onClick={async () => {
                  const destination = prompt(
                    "Export to a NEW absolute folder path",
                  );
                  if (destination) {
                    try {
                      await api("/export", "POST", { destination });
                      notify("Export queued. Follow its progress in Activity.");
                    } catch (e: any) {
                      setFail(e.message);
                    }
                  }
                }}
              >
                <ArrowDownToLine size={16} />
                Export all data
              </button>
            </section>
            <section className="panel prose">
              <h2>Account security</h2>
              <p>
                Sessions expire after 12 hours. Recovery codes work once and
                reset two-factor authentication.
              </p>
              <button
                onClick={async () => setTotp(await api("/totp/begin", "POST"))}
              >
                <ShieldCheck size={16} />
                Set up authenticator
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (confirm("Sign out every session, including this one?")) {
                    await api("/sessions/revoke", "POST");
                    location.reload();
                  }
                }}
              >
                Revoke all sessions
              </button>
            </section>
            <section className="panel prose">
              <h2>Local accounts</h2>
              <p>
                Additional accounts only see files explicitly shared with them.
              </p>
              {users?.map((u: Item) => (
                <div className="version-row" key={u.id}>
                  <span>
                    {u.name}
                    <small>{u.role}</small>
                  </span>
                  {u.role !== "owner" && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (confirm("Remove account and access grants?")) {
                          await api("/users/" + u.id, "DELETE");
                          reload();
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  try {
                    await api(
                      "/users",
                      "POST",
                      Object.fromEntries(new FormData(form)),
                    );
                    form.reset();
                    reload();
                    notify("Restricted account created");
                  } catch (e: any) {
                    setFail(e.message);
                  }
                }}
              >
                <label>
                  New account name
                  <input name="name" required autoComplete="off" />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    required
                    type="password"
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
                <button>
                  <Plus size={16} />
                  Create local account
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
      {totp && (
        <Modal
          title="Add local two-factor authentication"
          close={() => setTotp(null)}
        >
          <p>
            Add this secret to a TOTP authenticator on your device. No external
            provider is involved.
          </p>
          <label>
            Authenticator secret
            <input
              readOnly
              value={totp.secret}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  "/totp/confirm",
                  "POST",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                setTotp(null);
                notify("Two-factor authentication enabled");
              } catch (e: any) {
                setFail(e.message);
              }
            }}
          >
            <label>
              Six-digit verification code
              <input
                name="code"
                inputMode="numeric"
                required
                pattern="[0-9]{6}"
              />
            </label>
            <button className="primary">Verify and enable</button>
          </form>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

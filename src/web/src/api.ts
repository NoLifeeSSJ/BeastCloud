export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const r = await fetch("/api" + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      "X-CSRF": csrf,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    let msg = "Request failed (" + r.status + ")";
    try {
      msg = (await r.json()).error || msg;
    } catch {}
    throw Error(msg);
  }
  return r.status === 204 || r.headers.get("content-length") === "0"
    ? null
    : r.text().then((t) => (t ? JSON.parse(t) : null));
}
export const uid = () => crypto.randomUUID().replaceAll("-", "");
export const bytes = (n: number) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(1) + " KB"
      : n < 1073741824
        ? (n / 1048576).toFixed(1) + " MB"
        : (n / 1073741824).toFixed(1) + " GB";
export const date = (s: string) => (s ? new Date(s).toLocaleString() : "Never");
export async function digest(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function upload(
  file: File,
  parent: string | null,
  progress: (n: number) => void,
  signal: AbortSignal,
  item?: any,
) {
  const key =
    "transfer:" +
    parent +
    ":" +
    file.name +
    ":" +
    file.size +
    ":" +
    file.lastModified;
  let id = localStorage.getItem(key);
  let offset = 0;
  if (id) {
    try {
      const u = await api("/uploads/" + id);
      if (u.committed) {
        localStorage.removeItem(key);
        return u.committed;
      }
      offset = u.offset;
    } catch {
      id = null;
    }
  }
  if (!id) {
    const u = await api("/uploads", "POST", {
      name: file.name,
      total: file.size,
      parent,
      ...(item ? { itemId: item.id, baseRevision: item.revision } : {}),
    });
    id = u.id;
    localStorage.setItem(key, id!);
  }
  while (offset < file.size) {
    signal.throwIfAborted();
    const chunk = await file.slice(offset, offset + 4194304).arrayBuffer();
    const r = await fetch("/api/uploads/" + id, {
      method: "PATCH",
      headers: {
        "X-CSRF": csrf,
        "Upload-Offset": String(offset),
        "Upload-Checksum": await digest(chunk),
      },
      body: chunk,
      signal,
    });
    if (!r.ok) throw Error((await r.json()).error || "Transfer failed");
    offset = (await r.json()).offset;
    progress(file.size ? offset / file.size : 1);
  }
  signal.throwIfAborted();
  const result = await api("/uploads/" + id + "/commit", "POST");
  localStorage.removeItem(key);
  progress(1);
  return result.id;
}
export function occurrences(record: any, from: Date, to: Date) {
  const b =
    typeof record.body === "string" ? JSON.parse(record.body) : record.body;
  const output: any[] = [];
  const start = new Date(b.start);
  const end = new Date(b.end);
  const count =
    b.repeat === "none" || !b.repeat ? 1 : Math.min(b.count || 1, 366);
  for (let i = 0; i < count; i++) {
    const s = new Date(start);
    if (b.repeat === "daily") s.setUTCDate(s.getUTCDate() + i);
    if (b.repeat === "weekly") s.setUTCDate(s.getUTCDate() + i * 7);
    if (b.repeat === "monthly") {
      const day = s.getUTCDate();
      s.setUTCDate(1);
      s.setUTCMonth(s.getUTCMonth() + i);
      s.setUTCDate(
        Math.min(
          day,
          new Date(
            Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0),
          ).getUTCDate(),
        ),
      );
    }
    const e = new Date(+s + (+end - +start));
    if (e >= from && s <= to) output.push({ ...record, start: s, end: e });
  }
  return output;
}
export function zonedISO(value: string, zone: string) {
  const utc = new Date(value + "Z");
  let guess = +utc;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(guess))
      .replace(" ", "T");
    const represented = +new Date(parts + "Z");
    guess += +utc - represented;
  }
  return new Date(guess).toISOString();
}

export function localEventTime(iso: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(iso))
      .replace(" ", "T");
  } catch {
    return iso.slice(0, 16);
  }
}

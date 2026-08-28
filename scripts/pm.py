#!/usr/bin/env python3
"""
pm.py — read/write the Pet Pantry PM tracker (public.pm_tracker, row "default").

The tracker page stores its entire state as one JSON blob. This talks to the
same row over Supabase's REST API so the tracker can be edited from the
command line as well as in the browser.

  ./scripts/pm.py login                 sign in (interactive, run it yourself)
  ./scripts/pm.py show                  summary of the whole board
  ./scripts/pm.py get <dotpath>         print one field  (e.g. prd.problem)
  ./scripts/pm.py stories [status]      list stories, optionally filtered
  ./scripts/pm.py set <dotpath> <value> set one scalar field
  ./scripts/pm.py patch < patch.json    deep-merge a JSON object into state
  ./scripts/pm.py story <id|#n> k=v...  edit one story's fields
  ./scripts/pm.py add-story t=... ...   append a new story
  ./scripts/pm.py history               list recent snapshots (newest first)
  ./scripts/pm.py history <n>           show what changed in snapshot n
  ./scripts/pm.py restore <n>           roll the board back to snapshot n

Auth: the tracker row is RLS-scoped to your Supabase account, so every command
needs a session. `login` prompts for your password in your own terminal, stores
only the returned tokens in .pm-token.json (gitignored, chmod 600), and refreshes
them automatically. PM_ACCESS_TOKEN overrides the cache if you prefer.

Concurrency: every write re-reads the row first and refuses if the row's
updatedAt moved since this process read it, so a browser save can't be
silently clobbered. Reload the tracker page after a CLI write.
"""
import json, os, re, sys, urllib.request, urllib.error, uuid
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLE = "pm_tracker"
HIST = "pm_tracker_history"


def creds():
    cfg = open(os.path.join(ROOT, "public", "config.js")).read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", cfg)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", cfg)
    if not url or not key:
        sys.exit("could not read SUPABASE_URL / SUPABASE_ANON_KEY from public/config.js")
    return url.group(1).rstrip("/"), key.group(1)


BASE, KEY = creds()

TOKEN_FILE = os.path.join(ROOT, ".pm-token.json")


def _auth_post(grant, payload):
    r = urllib.request.Request(
        f"{BASE}/auth/v1/token?grant_type={grant}",
        data=json.dumps(payload).encode(),
        headers={"apikey": KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"auth failed (HTTP {e.code}): {e.read().decode()[:300]}")


def do_login():
    """Interactive only, by design: the password is typed by the account owner
    into their own terminal and is never stored — only the returned tokens are."""
    import getpass
    if not sys.stdin.isatty():
        sys.exit("login must be run interactively in your own terminal:\n"
                 "  ./scripts/pm.py login")
    email = input("Pet Pantry email: ").strip()
    password = getpass.getpass("Password (not echoed, not stored): ")
    tok = _auth_post("password", {"email": email, "password": password})
    save_token(tok)
    print(f"signed in as {tok.get('user', {}).get('email', email)}")


def save_token(tok):
    keep = {"access_token": tok["access_token"], "refresh_token": tok["refresh_token"],
            "expires_at": tok.get("expires_at", 0), "user_id": tok.get("user", {}).get("id")}
    with open(TOKEN_FILE, "w") as f:
        json.dump(keep, f)
    os.chmod(TOKEN_FILE, 0o600)


def token():
    if os.environ.get("PM_ACCESS_TOKEN"):
        return os.environ["PM_ACCESS_TOKEN"]
    if not os.path.exists(TOKEN_FILE):
        sys.exit("Not signed in. Run this in your own terminal first:\n"
                 "  ./scripts/pm.py login")
    tok = json.load(open(TOKEN_FILE))
    import time
    if tok.get("expires_at", 0) - 60 < time.time():
        fresh = _auth_post("refresh_token", {"refresh_token": tok["refresh_token"]})
        save_token(fresh)
        return fresh["access_token"]
    return tok["access_token"]


def head():
    return {"apikey": KEY, "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json"}


def req(method, path, body=None, extra=None, soft404=False):
    h = head()
    if extra:
        h.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}/rest/v1/{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        if soft404 and e.code == 404:
            return None
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")


def fetch():
    rows = req("GET", f"{TABLE}?select=state,updatedAt")
    if not rows:
        sys.exit(
            "No tracker row yet. Open pm.html in a browser and sign in once — it\n"
            "seeds your row from the page's built-in defaults — then re-run this."
        )
    return rows[0]["state"], rows[0]["updatedAt"]


def push(state, seen_at):
    _, now = fetch()
    if now != seen_at:
        sys.exit(f"Row changed since read ({seen_at} -> {now}). Re-run; nothing written.")
    stamp = datetime.now(timezone.utc).isoformat()
    req("PATCH", f"{TABLE}?userId=eq.{uid_of_me()}", {"state": state, "updatedAt": stamp},
        extra={"Prefer": "return=minimal"})
    print(f"saved  ({stamp})")


def uid_of_me():
    if os.path.exists(TOKEN_FILE):
        u = json.load(open(TOKEN_FILE)).get("user_id")
        if u:
            return u
    sys.exit("could not determine your user id; re-run: ./scripts/pm.py login")


def dig(obj, path):
    for part in path.split("."):
        if isinstance(obj, list):
            obj = obj[int(part)]
        else:
            obj = obj[part]
    return obj


def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v
    return dst


def find_story(stories, ref):
    if ref.startswith("#"):
        return stories[int(ref[1:]) - 1]
    for s in stories:
        if s.get("id") == ref:
            return s
    for i, s in enumerate(stories):
        if ref.lower() in s.get("title", "").lower():
            return s
    sys.exit(f"no story matching {ref!r}")


FIELD_ALIASES = {"t": "title", "d": "desc", "a": "acceptance",
                 "p": "priority", "s": "status", "pts": "points"}


def kvs(args):
    out = {}
    for a in args:
        if "=" not in a:
            sys.exit(f"expected key=value, got {a!r}")
        k, v = a.split("=", 1)
        out[FIELD_ALIASES.get(k, k)] = v
    return out


def shape(st):
    """One-line fingerprint of a board state, for diffing snapshots by eye."""
    stories = st.get("stories", [])
    by = {}
    for x in stories:
        by[x.get("status", "?")] = by.get(x.get("status", "?"), 0) + 1
    return (f"{len(stories)} stories (" + ", ".join(f"{k} {v}" for k, v in sorted(by.items())) + ")"
            f"  {len(st.get('timeline', []))} milestones  {len(st.get('notes', []))} notes")


def snapshots():
    rows = req("GET", f"{HIST}?select=id,savedAt,state&order=savedAt.desc&limit=50", soft404=True)
    if rows is None:
        sys.exit("history table missing — run supabase/pm_tracker_history_migration.sql")
    return rows


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]

    if cmd == "login":
        do_login()
        return

    if cmd == "history":
        rows = snapshots()
        if not rows:
            print("No snapshots yet. One is written each time the board changes.")
            return
        if args:
            n = int(args[0])
            snap = rows[n - 1]
            cur, _ = fetch()
            print(f"snapshot {n}  saved {snap['savedAt']}")
            print(f"  then: {shape(snap['state'])}")
            print(f"  now:  {shape(cur)}")
            return
        cur, _ = fetch()
        print(f"  current            {shape(cur)}")
        for i, r in enumerate(rows, 1):
            print(f"{i:3}. {r['savedAt'][:19]}  {shape(r['state'])}")
        return

    if cmd == "restore":
        if not args:
            sys.exit("which snapshot? see: ./scripts/pm.py history")
        rows = snapshots()
        n = int(args[0])
        if not 1 <= n <= len(rows):
            sys.exit(f"snapshot {n} out of range (1-{len(rows)})")
        snap = rows[n - 1]
        cur, at = fetch()
        print(f"restoring snapshot {n} from {snap['savedAt']}")
        print(f"  from: {shape(cur)}")
        print(f"  to:   {shape(snap['state'])}")
        # The restore is itself an update, so the trigger snapshots the state
        # being replaced — this is undoable in turn.
        push(snap["state"], at)
        return

    if cmd == "show":
        st, at = fetch()
        ov = st.get("overview", {})
        stories = st.get("stories", [])
        by = {}
        for s in stories:
            by[s.get("status", "?")] = by.get(s.get("status", "?"), 0) + 1
        print(f"{ov.get('name','?')}  — health: {ov.get('health','?')}")
        print(f"updated: {at}")
        print(f"stories: {len(stories)}  " + "  ".join(f"{k}={v}" for k, v in sorted(by.items())))
        print(f"roadmap: {len(st.get('timeline', []))} milestones")
        print(f"notes:   {len(st.get('notes', []))} entries")
        print(f"top-level keys: {', '.join(st.keys())}")

    elif cmd == "get":
        st, _ = fetch()
        v = dig(st, args[0]) if args else st
        print(v if isinstance(v, str) else json.dumps(v, indent=2, ensure_ascii=False))

    elif cmd == "stories":
        st, _ = fetch()
        want = args[0] if args else None
        for i, s in enumerate(st.get("stories", []), 1):
            if want and s.get("status") != want:
                continue
            pts = s.get("points") or "-"
            print(f"{i:3}. [{s.get('status','?'):8}] ({s.get('priority','?'):4} {pts:>2}pt) {s.get('title','')}")

    elif cmd == "set":
        st, at = fetch()
        path, val = args[0], args[1]
        *head, last = path.split(".")
        tgt = dig(st, ".".join(head)) if head else st
        tgt[last] = val
        push(st, at)

    elif cmd == "patch":
        st, at = fetch()
        merge(st, json.load(sys.stdin))
        push(st, at)

    elif cmd == "story":
        st, at = fetch()
        s = find_story(st.setdefault("stories", []), args[0])
        s.update(kvs(args[1:]))
        print(f"{s['title']} -> {json.dumps(kvs(args[1:]), ensure_ascii=False)}")
        push(st, at)

    elif cmd == "add-story":
        st, at = fetch()
        s = {"id": uuid.uuid4().hex[:12], "title": "", "desc": "", "acceptance": "",
             "priority": "med", "points": "", "status": "backlog"}
        s.update(kvs(args))
        if not s["title"]:
            sys.exit("a new story needs t=<title>")
        st.setdefault("stories", []).append(s)
        print(f"added: {s['title']}  [{s['status']}]")
        push(st, at)

    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

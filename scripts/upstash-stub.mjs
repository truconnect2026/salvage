// change 50: a test double for Upstash Redis REST, in Kickin' Chicken's
// stub tradition: the gates run the real store code (lib/live/redis.ts)
// against this, so the only untested seam in production is the hostname.
// Implements exactly the commands Salvage Live issues; anything else errors
// loudly rather than pretending.
//
//   POST /   body ["SET","key","v","NX","EX","43200"]  -> {"result": <reply>}
//   Authorization: Bearer <anything> (checked present)
//
// startUpstashStub(port?) -> { url, port, dump(), close() }; or run it:
//   node scripts/upstash-stub.mjs [port]

import http from "node:http";
import { pathToFileURL } from "node:url";

export function createStore() {
  const strings = new Map(); // key -> { value, expiresAt|null }
  const lists = new Map();
  const sets = new Map();
  const live = (key) => {
    const e = strings.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      strings.delete(key);
      return null;
    }
    return e;
  };
  const run = ([name, ...args]) => {
    switch (String(name).toUpperCase()) {
      case "PING":
        return "PONG";
      case "SET": {
        const [key, value, ...opts] = args;
        let nx = false;
        let ex = null;
        for (let i = 0; i < opts.length; i++) {
          const o = String(opts[i]).toUpperCase();
          if (o === "NX") nx = true;
          else if (o === "EX") ex = Number(opts[++i]);
          else throw new Error(`SET option ${o} not stubbed`);
        }
        if (nx && live(key)) return null;
        strings.set(key, { value: String(value), expiresAt: ex !== null ? Date.now() + ex * 1000 : null });
        return "OK";
      }
      case "GET":
        return live(args[0])?.value ?? null;
      case "DEL": {
        let n = 0;
        for (const k of args) n += Number(strings.delete(k)) + Number(lists.delete(k)) + Number(sets.delete(k));
        return n;
      }
      case "INCR": {
        const e = live(args[0]);
        const next = (e ? Number(e.value) : 0) + 1;
        strings.set(args[0], { value: String(next), expiresAt: e ? e.expiresAt : null });
        return next;
      }
      case "EXPIRE": {
        const e = live(args[0]);
        if (!e) return 0;
        e.expiresAt = Date.now() + Number(args[1]) * 1000;
        return 1;
      }
      case "TTL": {
        const e = live(args[0]);
        return !e ? -2 : e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - Date.now()) / 1000);
      }
      case "SADD": {
        const s = sets.get(args[0]) ?? new Set();
        let n = 0;
        for (const v of args.slice(1)) if (!s.has(String(v))) (s.add(String(v)), n++);
        sets.set(args[0], s);
        return n;
      }
      case "SREM": {
        const s = sets.get(args[0]);
        let n = 0;
        for (const v of args.slice(1)) if (s?.delete(String(v))) n++;
        return n;
      }
      case "SISMEMBER":
        return sets.get(args[0])?.has(String(args[1])) ? 1 : 0;
      case "SMEMBERS":
        return [...(sets.get(args[0]) ?? [])];
      case "LPUSH": {
        const l = lists.get(args[0]) ?? [];
        for (const v of args.slice(1)) l.unshift(String(v));
        lists.set(args[0], l);
        return l.length;
      }
      case "LTRIM": {
        const l = lists.get(args[0]) ?? [];
        const s = Number(args[1]);
        let e = Number(args[2]);
        if (e < 0) e = l.length + e;
        lists.set(args[0], l.slice(s, e + 1));
        return "OK";
      }
      case "LRANGE": {
        const l = lists.get(args[0]) ?? [];
        const s = Number(args[1]);
        let e = Number(args[2]);
        if (e < 0) e = l.length + e;
        return l.slice(s, e + 1);
      }
      default:
        throw new Error(`command ${name} not stubbed`);
    }
  };
  return { run, strings, lists, sets };
}

export function startUpstashStub(port = 0) {
  const store = createStore();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) return send(401, { error: "unauthorized" });
      try {
        send(200, { result: store.run(JSON.parse(body)) });
      } catch (err) {
        send(200, { error: String(err.message) });
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => {
      const p = server.address().port;
      resolve({ url: `http://127.0.0.1:${p}`, port: p, store, close: () => new Promise((r) => server.close(r)) });
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await startUpstashStub(Number(process.argv[2] || 8791));
  console.log(`upstash stub on ${s.url}`);
}

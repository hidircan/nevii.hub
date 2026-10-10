/**
 * DB egress ölçer — YALNIZ yerel bench için `NODE_OPTIONS=--import` ile yüklenir
 * (bkz. scripts/bench/bench-db-egress.ts). Uygulama kodu bu dosyayı hiç import etmez.
 *
 * Sunucu sürecinin kullandığı `pg` modülünü (sunucunun cwd'sinden çözülen AYNI CommonJS
 * örneği) yamalar: her sorguyu sayar ve PostgreSQL soketinden GELEN baytları (DB → uygulama
 * = Supabase'in "Database egress" dediği yön) toplar; baytlar o an soketteki etkin sorgunun
 * ana tablosuna (`FROM "public"."X"`) atfedilir. Sorgu parametresi veya satır içeriği ASLA
 * saklanmaz — yalnız tablo adı + sayı.
 */
import http from "node:http";
import { createRequire } from "node:module";

const port = Number(process.env.PG_METER_PORT || 0);
if (port > 0) {
  const counters = { queries: 0, bytesIn: 0, byTable: {} };
  let pg = null;
  try {
    pg = createRequire(`${process.cwd()}/`)("pg");
  } catch {
    pg = null;
  }
  const tableOf = (text) => {
    if (typeof text !== "string") return "(boşta)";
    const m = text.match(/FROM "public"\."(\w+)"/) || text.match(/^\s*(INSERT INTO|UPDATE|DELETE FROM) "public"\."(\w+)"/);
    if (!m) return "(diğer)";
    return m[2] ? `${m[2]} (yazma)` : m[1];
  };
  if (pg && !pg.__egressMeter) {
    pg.__egressMeter = true;
    const originalQuery = pg.Client.prototype.query;
    pg.Client.prototype.query = function meteredQuery(...args) {
      counters.queries += 1;
      if (this.connection) this.connection.__client = this;
      return originalQuery.apply(this, args);
    };
    const originalAttach = pg.Connection.prototype.attachListeners;
    pg.Connection.prototype.attachListeners = function meteredAttach(stream) {
      stream.on("data", (buf) => {
        counters.bytesIn += buf.length;
        const q = this.__client && this.__client.activeQuery;
        const t = tableOf(q && q.text);
        counters.byTable[t] = (counters.byTable[t] || 0) + buf.length;
      });
      return originalAttach.call(this, stream);
    };
  }
  const server = http.createServer((req, res) => {
    const snapshot = { ...counters, byTable: { ...counters.byTable }, pid: process.pid, patched: Boolean(pg && pg.__egressMeter) };
    if (req.url === "/reset") {
      counters.queries = 0;
      counters.bytesIn = 0;
      counters.byTable = {};
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(snapshot));
  });
  server.on("error", () => {
    // Aynı NODE_OPTIONS'ı devralan yardımcı süreçler portu alamaz — sessizce vazgeç.
  });
  server.listen(port, "127.0.0.1");
  server.unref();
}

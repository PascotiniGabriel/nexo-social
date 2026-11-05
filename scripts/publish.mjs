// Publica no Instagram os itens "pendente" de queue.json cujo horário já chegou.
// Instagram API com login unificado (graph.facebook.com, token de usuário do sistema que não expira). Sem dependências (Node 20).
// Env: IG_USER_ID, IG_ACCESS_TOKEN (segredos), DRY_RUN=1 (não chama a API nem altera a fila),
//      MEDIA_BASE_URL (padrão: https://<dono>.github.io/<repo>/), IG_API_VERSION (padrão v26.0),
//      NOW (ISO, só para testes), MAX_PER_RUN (padrão 2), QUEUE_FILE (padrão ./queue.json)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY = /^(1|true|sim)$/i.test(process.env.DRY_RUN ?? "");
const TOKEN = process.env.IG_ACCESS_TOKEN ?? "";
const UID = process.env.IG_USER_ID ?? "";
const VER = process.env.IG_API_VERSION || "v26.0";
const API = `https://${process.env.IG_GRAPH_HOST || "graph.facebook.com"}/${VER}`;
const QFILE = resolve(process.env.QUEUE_FILE || "queue.json");
const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
const MAX = Number(process.env.MAX_PER_RUN || 2);
const MAX_ATTEMPTS = 3;
const repoSlug = process.env.GITHUB_REPOSITORY; // dono/repo
const BASE = (process.env.MEDIA_BASE_URL || (repoSlug ? `https://${repoSlug.split("/")[0].toLowerCase()}.github.io/${repoSlug.split("/")[1]}/` : "")).replace(/\/?$/, "/");

// nunca imprime o token
const redact = (s) => (TOKEN ? String(s).split(TOKEN).join("***") : String(s));
const log = (...a) => console.log(redact(a.join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (p) => BASE + p.split("/").map(encodeURIComponent).join("/");

async function api(method, path, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = await fetch(method === "GET" ? `${API}${path}?${body}` : `${API}${path}`, method === "GET" ? {} : { method, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(redact(`API ${method} ${path}: ${j.error?.message ?? res.status}`));
  return j;
}
async function waitFinished(id, { every = 15000, max = 10 * 60000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const j = await api("GET", `/${id}`, { fields: "status_code,status" });
    log(`  container ${id}: ${j.status_code}`);
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") throw new Error(`container ${j.status_code}: ${j.status ?? ""}`);
    if (Date.now() - t0 > max) throw new Error("tempo esgotado esperando o processamento do vídeo");
    await sleep(every);
  }
}
async function mediaReachable(path) {
  const r = await fetch(url(path), { method: "HEAD" });
  return r.ok;
}

async function publishItem(it) {
  for (const m of [...it.media, ...(it.cover ? [it.cover] : [])]) {
    if (!(await mediaReachable(m))) throw Object.assign(new Error(`mídia ainda não está no ar: ${url(m)}`), { transient: true });
  }
  let creation;
  if (it.type === "reel") {
    const p = { media_type: "REELS", video_url: url(it.media[0]), caption: it.caption, share_to_feed: "true" };
    if (it.cover) p.cover_url = url(it.cover);
    creation = (await api("POST", `/${UID}/media`, p)).id;
  } else if (it.type === "image") {
    creation = (await api("POST", `/${UID}/media`, { image_url: url(it.media[0]), caption: it.caption })).id;
  } else if (it.type === "carousel") {
    const kids = [];
    for (const m of it.media) {
      const c = (await api("POST", `/${UID}/media`, { image_url: url(m), is_carousel_item: "true" })).id;
      await waitFinished(c);
      kids.push(c);
    }
    creation = (await api("POST", `/${UID}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: it.caption })).id;
  } else throw new Error("tipo desconhecido: " + it.type);
  await waitFinished(creation);
  return (await api("POST", `/${UID}/media_publish`, { creation_id: creation })).id;
}

const queue = JSON.parse(readFileSync(QFILE, "utf8"));
const isDue = (q) => q.status === "pendente" && new Date(q.publish_at) <= NOW;
const due = queue.filter(isDue).sort((a, b) => a.publish_at.localeCompare(b.publish_at));
log(`${DRY ? "[DRY_RUN] " : ""}agora=${NOW.toISOString()} | na fila: ${queue.length} | vencidos: ${due.length} | base=${BASE || "(vazia)"}`);
for (const q of queue) log(`  ${isDue(q) ? "->" : "  "} ${q.id} [${q.type}] ${q.publish_at} ${q.status}`);
if (!due.length) { log("nada para publicar."); process.exit(0); }

if (DRY) {
  for (const it of due.slice(0, MAX)) log(`[DRY_RUN] publicaria ${it.id} (${it.type}) mídia=${it.media.length} legenda="${it.caption.slice(0, 50).replace(/\n/g, " ")}..."`);
  process.exit(0);
}
if (!TOKEN || !UID) { console.error("faltam os segredos IG_USER_ID / IG_ACCESS_TOKEN"); process.exit(1); }

try {
  const lim = await api("GET", `/${UID}/content_publishing_limit`, { fields: "quota_usage,config" });
  const d = lim.data?.[0] ?? lim;
  const used = d.quota_usage ?? 0, total = d.config?.quota_total ?? 100;
  log(`limite de publicação: ${used}/${total}`);
  if (used >= total) { log("limite diário atingido; tento no próximo ciclo."); process.exit(0); }
} catch (e) { log("aviso: não consegui ler content_publishing_limit -", e.message); }

for (const it of due.slice(0, MAX)) {
  log(`publicando ${it.id} (${it.type})...`);
  try {
    it.ig_media_id = await publishItem(it);
    it.status = "publicado"; it.published_at = new Date().toISOString(); delete it.error;
    log(`  ok: ig_media_id=${it.ig_media_id}`);
  } catch (e) {
    it.attempts = (it.attempts ?? 0) + (e.transient ? 0 : 1);
    it.error = redact(e.message).slice(0, 300);
    if (it.attempts >= MAX_ATTEMPTS) it.status = "erro";
    log(`  falhou (${it.attempts}/${MAX_ATTEMPTS}): ${it.error}`);
  }
  writeFileSync(QFILE, JSON.stringify(queue, null, 2) + "\n"); // grava a cada item
}

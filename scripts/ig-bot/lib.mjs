// Utilidades comuns do atendente IA. Sem dependências (Node 20).
// REGRA: o repositório é público. Nunca registrar texto/nome/telefone de cliente em log ou arquivo.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(DIR, "..", "..");
export const SECRETS = () => [process.env.IG_ACCESS_TOKEN, process.env.GEMINI_API_KEY, process.env.GH_PAT].filter(Boolean);
export const redact = (s) => SECRETS().reduce((t, k) => t.split(k).join("***"), String(s));
export const log = (...a) => console.log(redact(a.join(" ")));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const loadConfig = () => JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
export const loadRegras = () => readFileSync(join(DIR, "regras.md"), "utf8");
export const sha = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

const STATE = join(ROOT, "ig-bot-state.json");
export function loadState() {
  const e = { comments: {}, messages: {}, convs: {} };
  return existsSync(STATE) ? { ...e, ...JSON.parse(readFileSync(STATE, "utf8")) } : e;
}
export function saveState(st) {
  const cut = Date.now() - 14 * 864e5;
  for (const k of ["comments", "messages"]) for (const id in st[k]) if (st[k][id] < cut) delete st[k][id];
  for (const id in st.convs) if ((st.convs[id].t ?? 0) < cut) delete st.convs[id];
  writeFileSync(STATE, JSON.stringify(st, null, 1) + "\n");
}

export const IG_HOST = process.env.IG_GRAPH_HOST || "graph.facebook.com";
export const IG_API = `https://${IG_HOST}/${process.env.IG_API_VERSION || "v26.0"}`;
// Chamada à Graph API. Devolve {ok, status, j}; nunca lança por erro da Meta.
export async function ig(method, path, params = {}, token = process.env.IG_ACCESS_TOKEN) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  p.set("access_token", token);
  const res = await fetch(method === "GET" ? `${IG_API}${path}?${p}` : `${IG_API}${path}`, method === "GET" ? {} : { method, body: p });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && !j.error, status: res.status, j, err: j.error ? `code=${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""} type=${j.error.type}` : "" };
}

// Emojis (aprox.). Mantém só o primeiro.
const EMO = /\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|️)*/gu;
export const countEmoji = (s) => (s.match(EMO) || []).length;
export function keepOneEmoji(s) {
  let n = 0;
  return s.replace(EMO, (m) => (++n === 1 ? m : "")).replace(/ {2,}/g, " ").trim();
}
export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

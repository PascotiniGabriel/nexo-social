// Diagnóstico de envio de DM ao DONO. Loga só códigos/IDs técnicos, nunca conteúdo de mensagens.
import { readFileSync } from "node:fs";
const API = `https://graph.facebook.com/${process.env.IG_API_VERSION || "v26.0"}`;
const IG = process.env.IG_USER_ID, TK = process.env.IG_ACCESS_TOKEN;
const st = JSON.parse(readFileSync("ig-bot-state.json", "utf8"));
const OWNER = st.owner?.igsid;
const err = (j) => j?.error ? `code=${j.error.code}/${j.error.error_subcode ?? "-"} type=${j.error.type} msg="${String(j.error.message).slice(0, 140)}"` : "ok";
async function get(path, token = TK) {
  const r = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}access_token=${token}`);
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
async function post(path, body, token = TK) {
  const r = await fetch(`${API}/${path}?access_token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
console.log("owner_igsid_presente", !!OWNER);
for (const folder of ["", "&folder=inbox", "&folder=other", "&folder=pending"]) {
  const r = await get(`${IG}/conversations?platform=instagram&fields=participants,messages.limit(1){from}${folder}`);
  const d = r.j.data || [];
  const hit = d.find((c) => (c.participants?.data || []).some((p) => p.id === OWNER));
  const fromIds = hit ? (hit.messages?.data || []).map((m) => m.from?.id === OWNER ? "dono" : "outro") : [];
  console.log(`conversas${folder || " (padrao)"} http=${r.s} n=${d.length} dono_na_lista=${!!hit} ultimo_from=${fromIds.join(",")} ${err(r.j)}`);
  if (hit) console.log("  ids_participantes", (hit.participants.data || []).map((p) => p.id === OWNER ? "DONO" : p.id === IG ? "IG_USER" : "id:" + p.id).join(","));
}
const me = await get("me?fields=id,name");
console.log("me", me.s, err(me.j), me.j.id ? "id_ok" : "");
const acc = await get("me/accounts?fields=id,name,instagram_business_account,access_token");
const pages = acc.j.data || [];
console.log("me/accounts", acc.s, "n=" + pages.length, err(acc.j));
const igp = await get(`${IG}?fields=id,username`);
console.log("ig_user", igp.s, err(igp.j));
const txt = (v) => ({ text: `teste de diagnóstico do atendente (${v}). Pode ignorar.` });
const tries = [
  ["ig/messages", () => post(`${IG}/messages`, { recipient: { id: OWNER }, message: txt("A") })],
  ["ig/messages RESPONSE", () => post(`${IG}/messages`, { recipient: { id: OWNER }, messaging_type: "RESPONSE", message: txt("B") })],
  ["me/messages", () => post(`me/messages`, { recipient: { id: OWNER }, message: txt("C") })],
  ["ig/messages HUMAN_AGENT", () => post(`${IG}/messages`, { recipient: { id: OWNER }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: txt("D") })],
];
for (const p of pages) tries.push([`page(${p.instagram_business_account?.id === IG ? "vinculada" : "outra"})/messages`, () => post(`${p.id}/messages`, { recipient: { id: OWNER }, message: txt("E") }, p.access_token)]);
for (const [nome, fn] of tries) {
  const r = await fn();
  console.log(`envio ${nome}: http=${r.s} ${err(r.j)}`);
  if (r.s === 200) break;
}

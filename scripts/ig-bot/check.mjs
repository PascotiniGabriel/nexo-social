// Diagnóstico SÓ LEITURA. Imprime apenas ok/falhou + código de erro da Meta. Nenhum dado de conteúdo.
import { ig, log, IG_HOST } from "./lib.mjs";
const UID = process.env.IG_USER_ID;
const rows = [];
const rep = (nome, r, extra = "") => { rows.push(r.ok); log(`${r.ok ? "OK    " : "FALHOU"} ${nome}${r.ok ? "" : " -> http=" + r.status + " " + r.err}${extra ? " | " + extra : ""}`); };
log(`host=${IG_HOST} token=${process.env.IG_ACCESS_TOKEN ? "presente" : "AUSENTE"} ig_user_id=${UID ? "presente" : "AUSENTE"}`);

const me = await ig("GET", "/me", { fields: "id" });
rep("GET /me (identidade do token)", me);
const perm = await ig("GET", "/me/permissions");
rep("GET /me/permissions", perm, perm.ok ? (perm.j.data || []).map((p) => `${p.permission}:${p.status}`).join(", ") : "");
const dbg = await ig("GET", "/debug_token", { input_token: process.env.IG_ACCESS_TOKEN });
rep("GET /debug_token", dbg, dbg.ok ? `tipo=${dbg.j.data?.type} escopos=${(dbg.j.data?.scopes || []).join(",")} expira=${dbg.j.data?.expires_at === 0 ? "nunca" : dbg.j.data?.expires_at}` : "");

const prof = await ig("GET", `/${UID}`, { fields: "id,username" });
rep("Ler perfil do Instagram", prof);
const media = await ig("GET", `/${UID}/media`, { fields: "id", limit: 5 });
rep("Listar mídias do Instagram", media, `${(media.j.data || []).length} mídias`);
let nCom = 0, comOk = false, comErr = null;
for (const m of media.j.data || []) {
  const c = await ig("GET", `/${m.id}/comments`, { fields: "id", limit: 5 });
  if (c.ok) { comOk = true; nCom += (c.j.data || []).length; } else comErr = c;
}
if (media.ok && (media.j.data || []).length) rep("Ler comentários das mídias", comOk ? { ok: true } : comErr, `${nCom} comentários nas 5 últimas`);
else log("NAO VERIFICADO Ler comentários (sem mídia para testar)");

// Conversas (DMs): tenta o caminho direto e o via Página vinculada.
const c1 = await ig("GET", `/${UID}/conversations`, { platform: "instagram", fields: "id", limit: 3 });
rep("Ler conversas (DMs) via /{ig-user}/conversations", c1, c1.ok ? `${(c1.j.data || []).length} conversas` : "");
const pages = await ig("GET", "/me/accounts", { fields: "id,instagram_business_account", limit: 10 });
rep("Listar Páginas acessíveis (/me/accounts)", pages, pages.ok ? `${(pages.j.data || []).length} páginas` : "");
let viaPage = false;
for (const pg of pages.j.data || []) {
  const link = pg.instagram_business_account?.id === UID;
  const c = await ig("GET", `/${pg.id}/conversations`, { platform: "instagram", fields: "id", limit: 3 });
  rep(`Ler conversas via Página${link ? " vinculada ao IG" : ""}`, c, c.ok ? `${(c.j.data || []).length} conversas` : "");
  if (c.ok && link) viaPage = true;
}
log(`RESUMO comentarios=${comOk ? "ok" : "falhou"} dms_direto=${c1.ok ? "ok" : "falhou"} dms_via_pagina=${viaPage ? "ok" : "falhou/nao testado"}`);
process.exit(0);

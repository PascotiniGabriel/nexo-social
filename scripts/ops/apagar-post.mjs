// Apaga um post do próprio perfil (id passado em MEDIA_ID). Loga só código de resultado.
const API = `https://graph.facebook.com/${process.env.IG_API_VERSION || "v26.0"}`;
const id = process.env.MEDIA_ID, tk = process.env.IG_ACCESS_TOKEN;
if (!/^\d+$/.test(id || "")) throw new Error("MEDIA_ID inválido");
const r = await fetch(`${API}/${id}?access_token=${tk}`, { method: "DELETE" });
const j = await r.json().catch(() => ({}));
console.log("http", r.status, j.success === true ? "apagado" : `erro code=${j.error?.code}/${j.error?.error_subcode ?? "-"} msg="${String(j.error?.message || "").slice(0, 160)}"`);
if (j.success !== true) process.exit(1);

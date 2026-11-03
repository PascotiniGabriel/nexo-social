// Rodar localmente no repositório privado (nexo-imob-saas): copia publisher/staging/<semana>/ para media/ e anexa na queue.json.
// Uso: node publisher/repo-template/scripts/enqueue.mjs <semana>     (ex.: legado, 2026-W45)
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const tpl = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const week = process.argv[2];
if (!week) { console.error("uso: node publisher/repo-template/scripts/enqueue.mjs <semana>"); process.exit(1); }
const stage = resolve(tpl, "../staging", week);
if (!existsSync(join(stage, "queue-entries.json"))) { console.error("não achei", stage); process.exit(1); }
cpSync(stage, join(tpl, "media", week), { recursive: true, filter: (s) => !s.endsWith("queue-entries.json") });
const qf = join(tpl, "queue.json");
const queue = JSON.parse(readFileSync(qf, "utf8"));
let added = 0;
for (const e of JSON.parse(readFileSync(join(stage, "queue-entries.json"), "utf8"))) {
  if (queue.some((q) => q.id === e.id)) continue;
  queue.push(e); added++;
}
queue.sort((a, b) => a.publish_at.localeCompare(b.publish_at));
writeFileSync(qf, JSON.stringify(queue, null, 2) + "\n");
console.log(`ok: ${added} itens novos em queue.json; mídia em media/${week}/. Agora: git add -A, commit e push no repositório público.`);

// Registro privado (issues no repo privado). Os dados de cliente ficam SÓ lá.
const T = () => process.env.GH_PAT;
export const temPAT = () => !!T();
async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { authorization: `Bearer ${T()}`, accept: "application/vnd.github+json", "user-agent": "nexo-ig-bot", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${method} ${path.split("?")[0]} http=${r.status}`);
  return j;
}
export const criarIssue = (repo, title, body, labels) => gh("POST", `/repos/${repo}/issues`, { title, body, labels });
// Horários ocupados = linha "SLOT: YYYY-MM-DD HH:mm" nas issues abertas com label agendamento.
export async function slotsOcupados(repo) {
  const issues = await gh("GET", `/repos/${repo}/issues?labels=agendamento&state=open&per_page=100`);
  const out = [];
  for (const i of issues) {
    const m = /^SLOT:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/m.exec(i.body || "");
    if (m) out.push(m[1]);
  }
  return out;
}

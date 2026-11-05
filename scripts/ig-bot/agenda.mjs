// Calcula horários livres (fuso de São Paulo) descontando os já ocupados.
export function agoraSP(cfg, now = new Date()) {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: cfg.agenda.fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const [d, t] = f.format(now).split(" ");
  return { data: d, hora: t };
}
// ocupados: array de "YYYY-MM-DD HH:mm". Começa no próximo dia útil.
export function horariosLivres(cfg, ocupados = [], now = new Date(), max = 10) {
  const a = cfg.agenda, hoje = agoraSP(cfg, now), out = [];
  const busy = new Set(ocupados);
  let d = new Date(hoje.data + "T12:00:00Z");
  for (let i = 1; i <= a.dias_a_frente + 6; i++) {
    d = new Date(d.getTime() + 864e5);
    const ds = d.toISOString().slice(0, 10);
    if (!a.dias_uteis.includes(d.getUTCDay()) || a.feriados.includes(ds)) continue;
    let n = 0; // no máximo 3 por dia, para variar os dias
    for (const h of a.inicios) if (!busy.has(`${ds} ${h}`) && n < 3) { out.push(`${ds} ${h}`); n++; }
  }
  return out.slice(0, max);
}
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const rotulo = (s) => {
  const [d, h] = s.split(" ");
  return `${DIAS[new Date(d + "T12:00:00Z").getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)} às ${h.replace(":00", "h").replace(":", "h")}`;
};

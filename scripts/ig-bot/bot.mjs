// Atendente IA do Instagram (@nexoimob.ia). Roda no GitHub Actions a cada 10 min.
// Env: IG_USER_ID, IG_ACCESS_TOKEN, GEMINI_API_KEY, GH_PAT; BOT_MODE=ensaio|ativo (padrão ensaio).
// REPO PÚBLICO: o log mostra só contagens. Texto/nome/telefone de cliente só vão para issues do repo PRIVADO.
import { ig, log, loadConfig, loadState, saveState, sha, redact } from "./lib.mjs";
import { pensar, palavraChave, HUMANO, stats } from "./brain.mjs";
import { horariosLivres, rotulo, agoraSP } from "./agenda.mjs";
import { temPAT, criarIssue, slotsOcupados } from "./gh.mjs";

const cfg = loadConfig();
const MODO = (process.env.BOT_MODE || cfg.modo_padrao) === "ativo" ? "ativo" : "ensaio"; // qualquer outro valor = ensaio
const UID = process.env.IG_USER_ID;
const REPO = cfg.repo_privado;
const L = cfg.limites;
const c = { comentarios_vistos: 0, resp_publicas: 0, directs_enviados_comentario: 0, ignorados: 0, dms_respondidas: 0, humano: 0, agendamentos: 0, rascunhos: 0, erros: 0 };
log(`ig-bot modo=${MODO}`);
if (!temPAT()) { log("sem GH_PAT: nada a fazer (o bot não agenda nem grava rascunhos sem ele)"); process.exit(0); }
if (!process.env.GEMINI_API_KEY || !process.env.IG_ACCESS_TOKEN || !UID) { log("faltam secrets (GEMINI_API_KEY / IG_ACCESS_TOKEN / IG_USER_ID)"); process.exit(0); }

const st = loadState();
const hoje = () => agoraSP(cfg).data;
let ocupados = [];
try { ocupados = await slotsOcupados(REPO); } catch (e) { log("erro lendo agenda (issues):", e.message); process.exit(0); }
let budget = L.maximo_itens_por_execucao;
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const livres = () => horariosLivres(cfg, ocupados);

async function issue(titulo, corpo, labels) {
  try { await criarIssue(REPO, titulo, corpo, labels); return true; } catch (e) { log("falha ao criar issue:", e.message); c.erros++; return false; }
}
const humanoIssue = (canal, usuario, texto, motivo) => issue(`Instagram: precisa de humano (${canal})`, `Motivo: ${motivo}\nUsuário: @${usuario ?? "?"}\nMensagem: ${texto}\n\nResponda no Instagram (app) quando puder.`, ["instagram-humano"]);

async function enviarDM(destino, texto) {
  const r = await ig("POST", `/${UID}/messages`, { recipient: destino, message: { text: texto } });
  if (!r.ok) log(`envio DM falhou http=${r.status} ${r.err}`);
  return r.ok;
}

// ---------- Comentários ----------
async function comentarios() {
  const own = await ig("GET", `/${UID}`, { fields: "username" });
  const meuUser = own.j.username;
  const midias = await ig("GET", `/${UID}/media`, { fields: "id,timestamp", limit: L.midias_recentes });
  if (!midias.ok) { log(`ler mídias falhou ${midias.err}`); c.erros++; return; }
  const corte = Date.now() - L.comentarios_dias * 864e5;
  for (const m of midias.j.data || []) {
    const cm = await ig("GET", `/${m.id}/comments`, { fields: "id,text,timestamp,username", limit: 50 });
    if (!cm.ok) { log(`ler comentários falhou ${cm.err}`); c.erros++; continue; }
    for (const k of cm.j.data || []) {
      if (st.comments[k.id] || k.username === meuUser || !k.text || new Date(k.timestamp) < corte) continue;
      if (budget <= 0) return;
      c.comentarios_vistos++;
      const kw = palavraChave(k.text, cfg);
      let pub = null, dm = null, motivo = null, ia = null;
      if (kw) { pub = rand(cfg.resposta_publica_palavra_chave); dm = cfg.abertura_direct; }
      else {
        try { ia = await pensar({ canal: "comentario", historico: [{ de: "cliente", texto: k.text }], livres: livres(), confusos: 0 }, cfg); }
        catch (e) { log("gemini indisponível:", e.message); return; } // não marca: tenta na próxima execução
        if (ia.acao === "ignorar") { c.ignorados++; st.comments[k.id] = Date.now(); continue; }
        if (ia.precisa_humano) { c.humano++; await humanoIssue("comentário", k.username, k.text, ia.motivo || ia.intencao); st.comments[k.id] = Date.now(); continue; }
        pub = ia.resposta;
      }
      budget--;
      if (MODO === "ensaio") {
        const ok = await issue(`[ensaio] comentário de @${k.username}${kw ? ` (palavra-chave ${kw})` : ""}`, `Comentário: ${k.text}\n\nRESPOSTA PÚBLICA (rascunho): ${pub}\n${dm ? `DIRECT (rascunho): ${dm}\n` : ""}\nNada foi enviado (modo ensaio).`, ["ig-ensaio"]);
        if (ok) { c.rascunhos++; st.comments[k.id] = Date.now(); }
        continue;
      }
      const r1 = await ig("POST", `/${k.id}/replies`, { message: pub });
      if (r1.ok) c.resp_publicas++; else { log(`resposta pública falhou ${r1.err}`); c.erros++; }
      if (dm) {
        const r2 = await ig("POST", `/${UID}/messages`, { recipient: { comment_id: k.id }, message: { text: dm } });
        if (r2.ok) c.directs_enviados_comentario++; else { log(`private reply falhou http=${r2.status} ${r2.err}`); c.erros++; await humanoIssue("comentário", k.username, k.text, "private reply falhou"); }
      }
      st.comments[k.id] = Date.now();
    }
  }
}

// ---------- Directs ----------
async function directs() {
  const f = "id,updated_time,participants,messages.limit(15){id,message,from,created_time}";
  const r = await ig("GET", `/${UID}/conversations`, { platform: "instagram", fields: f, limit: 20 });
  if (!r.ok) { log(`ler conversas falhou http=${r.status} ${r.err}`); c.erros++; return; }
  for (const cv of r.j.data || []) {
    const msgs = [...(cv.messages?.data || [])].sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
    const doCliente = msgs.filter((m) => m.from?.id !== UID);
    const novas = doCliente.filter((m) => !st.messages[m.id]);
    if (!novas.length) continue;
    const ultima = msgs[msgs.length - 1], ultCli = doCliente[doCliente.length - 1];
    const marcar = () => novas.forEach((m) => (st.messages[m.id] = Date.now()));
    if (ultima.from?.id === UID) { marcar(); continue; } // já respondida (por nós ou pelo humano)
    if (Date.now() - new Date(ultCli.created_time) > 23.5 * 36e5) { marcar(); continue; } // fora da janela de 24 h
    if (budget <= 0) return;
    const h = sha(cv.id);
    let cs = st.convs[h] ?? (st.convs[h] = { t: Date.now(), day: hoje(), n: 0, confuso: 0, humano: false });
    if (cs.day !== hoje()) { cs.day = hoje(); cs.n = 0; }
    cs.t = Date.now();
    if (cs.humano) { marcar(); continue; } // humano assumiu: bot em silêncio
    const user = ultCli.from?.username;
    const hist = msgs.map((m) => ({ de: m.from?.id === UID ? "nos" : "cliente", texto: (m.message || "[anexo/mídia sem texto]").slice(0, 800) }));
    let res;
    if (cs.n >= L.respostas_por_conversa_por_dia) res = { resposta: HUMANO, precisa_humano: true, pre_agendado: false, dados: {}, intencao: "humano", motivo: "limite diário de respostas na conversa" };
    else {
      try { res = await pensar({ canal: "direct", historico: hist, livres: livres(), confusos: cs.confuso }, cfg); }
      catch (e) { log("gemini indisponível:", e.message); return; }
    }
    budget--;
    cs.confuso = res.entendeu === false ? cs.confuso + 1 : 0;
    if (cs.confuso >= 2 && !res.precisa_humano) { res.precisa_humano = true; res.resposta = HUMANO; res.pre_agendado = false; res.motivo = "2 respostas seguidas sem entender"; }
    let texto = res.resposta;
    const d = res.dados || {};
    let slotNovo = null;
    if (res.pre_agendado && MODO === "ativo") {
      try { ocupados = await slotsOcupados(REPO); } catch { log("erro relendo agenda"); return; }
      if (ocupados.includes(d.horario_escolhido)) {
        const alt = livres().slice(0, 2).map(rotulo).join(" ou ");
        texto = `Esse horário acabou de ser ocupado. Consigo ${alt}. Qual prefere?`; res.pre_agendado = false;
      } else {
        const ok = await issue(`Agendamento: ${d.nome} (${d.imobiliaria}) - ${rotulo(d.horario_escolhido)}`,
          `SLOT: ${d.horario_escolhido}\nModalidade: ${d.modalidade}\nNome: ${d.nome}\nImobiliária: ${d.imobiliaria}\nCidade: ${d.cidade}\nCorretores: ${d.corretores ?? "-"}\nWhatsApp: ${d.whatsapp}\nInstagram: @${user ?? "?"}\n\nPré-agendado pelo bot. Confirmar no WhatsApp.`, ["agendamento"]);
        if (!ok) { return; } // não confirma ao cliente sem ter registrado; tenta de novo na próxima execução
        ocupados.push(d.horario_escolhido); slotNovo = d.horario_escolhido; c.agendamentos++;
      }
    }
    if (res.precisa_humano) { c.humano++; if (MODO === "ativo") await humanoIssue("direct", user, ultCli.message || "[sem texto]", res.motivo || res.intencao); cs.humano = true; }
    if (MODO === "ensaio") {
      const ok = await issue(`[ensaio] direct de @${user ?? "?"} - ${res.intencao}${res.precisa_humano ? " (HUMANO)" : ""}`,
        `Última mensagem do cliente: ${ultCli.message ?? "[sem texto]"}\n\nRESPOSTA (rascunho): ${texto}\n\nDados coletados: ${JSON.stringify(d)}\nPré-agendado: ${res.pre_agendado ? "SIM, seria registrado o slot " + d.horario_escolhido : "não"}\nPrecisa de humano: ${res.precisa_humano}${res.motivo ? " (" + res.motivo + ")" : ""}\n\nNada foi enviado (modo ensaio).`, ["ig-ensaio"]);
      if (ok) { c.rascunhos++; cs.n++; marcar(); }
      continue;
    }
    const enviado = await enviarDM({ id: ultCli.from.id }, texto);
    if (enviado) { c.dms_respondidas++; cs.n++; } else { c.erros++; await humanoIssue("direct", user, ultCli.message || "[sem texto]", "falha ao enviar resposta"); }
    marcar();
  }
}

try { await comentarios(); await directs(); }
catch (e) { c.erros++; log("erro inesperado:", redact(e.message)); }
finally {
  saveState(st);
  log(`resumo modo=${MODO} ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ")} gemini_chamadas=${stats.chamadas}`);
}

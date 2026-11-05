// Atendente IA do Instagram (@nexoimob.ia). Roda no GitHub Actions a cada 10 min.
// Env: IG_USER_ID, IG_ACCESS_TOKEN, GEMINI_API_KEY. Modo (ensaio|ativo|pausado) fica em ig-bot-state.json (bot_mode), mudado pelo dono por DM.
// REPO PÚBLICO: o log mostra só contagens. Conteúdo de cliente nunca vai a arquivo/log em claro:
// o estado guarda IDs e, quando preciso, dados CIFRADOS. Os avisos ao dono vão por DM (@gabriel_pascotini) e são remontados via API.
import { ig, log, loadConfig, loadState, saveState, sha, redact, enc, dec } from "./lib.mjs";
import { pensar, palavraChave, HUMANO, stats } from "./brain.mjs";
import { horariosLivres, rotulo, agoraSP } from "./agenda.mjs";

const cfg = loadConfig();
const UID = process.env.IG_USER_ID;
const L = cfg.limites;
const H = 36e5;
const c = { comentarios_vistos: 0, resp_publicas: 0, directs_de_comentario: 0, ignorados: 0, dms_respondidas: 0, humano: 0, agendamentos: 0, rascunhos: 0, avisos_enviados: 0, comandos_dono: 0, erros: 0 };
if (!process.env.GEMINI_API_KEY || !process.env.IG_ACCESS_TOKEN || !UID) { log("faltam secrets (GEMINI_API_KEY / IG_ACCESS_TOKEN / IG_USER_ID)"); process.exit(0); }

const st = loadState();
const modo = () => st.bot_mode || cfg.modo_padrao || "ensaio"; // ensaio | ativo | pausado
log(`ig-bot modo=${modo()}`);
const hoje = () => agoraSP(cfg).data;
const ocupados = () => st.agendados;
const livres = () => horariosLivres(cfg, ocupados());
const rand = (a) => a[Math.floor(Math.random() * a.length)];
let budget = L.maximo_itens_por_execucao;
const dono = () => st.owner;
const janelaDono = () => (dono().lastMsgAt ? dono().lastMsgAt + 24 * H - Date.now() : -1); // ms restantes

// ÚNICO ponto de envio de DM. Em ensaio/pausado só o dono pode receber, exceto envio aprovado por ele ("ok N").
async function enviarDM(destino, texto, { aprovado = false, tag = false } = {}) {
  const paraDono = destino.id && destino.id === dono().igsid;
  if (!paraDono && !aprovado && modo() !== "ativo") throw new Error("BLOQUEADO: envio a cliente fora do modo ativo");
  const p = { recipient: destino, message: { text: texto.slice(0, 990) } };
  if (tag) { p.messaging_type = "MESSAGE_TAG"; p.tag = "HUMAN_AGENT"; }
  const r = await ig("POST", `/${UID}/messages`, p);
  if (!r.ok) log(`envio DM falhou (${paraDono ? "dono" : "cliente"}) http=${r.status} ${r.err}`);
  return r.ok;
}
async function responderComentario(id, texto, aprovado = false) {
  if (!aprovado && modo() !== "ativo") throw new Error("BLOQUEADO: resposta pública fora do modo ativo");
  return (await ig("POST", `/${id}/replies`, { message: texto })).ok;
}

// ---------- Itens (avisos ao dono), guardados como referência + payload cifrado ----------
function novoItem(tipo, ref, payload) {
  const it = { n: ++st.seq, tipo, ref, enc: enc(payload), t: Date.now(), avisado: false, status: "aberto" };
  st.itens.push(it);
  return it;
}
async function reler(ref) {
  if (ref.kind === "dm") { const r = await ig("GET", `/${ref.id}`, { fields: "message,from" }); return r.ok ? { texto: r.j.message, user: r.j.from?.username } : {}; }
  const r = await ig("GET", `/${ref.id}`, { fields: "text,username" });
  return r.ok ? { texto: r.j.text, user: r.j.username } : {};
}
const cut = (s, n) => (s && s.length > n ? s.slice(0, n) + "..." : s || "[não consegui reler]");
async function textoAviso(it) {
  const p = dec(it.enc), x = await reler(it.ref), canal = it.ref.kind === "dm" ? "Direct" : "Comentário";
  if (!p) return `#${it.n} (conteúdo ilegível, descartado)`;
  if (it.tipo === "rascunho") {
    const resp = it.ref.kind === "cm" ? `Pública: "${p.pub}"${p.dm ? `\nDirect: "${cut(p.dm, 160)}"` : ""}` : `"${p.resposta}"`;
    const ag = p.pre ? `\nPré-agenda ${rotulo(p.dados.horario_escolhido)} (${p.dados.modalidade}): ${p.dados.nome}, ${p.dados.imobiliaria}, ${p.dados.cidade}, ${p.dados.whatsapp}.` : "";
    return `#${it.n} ${canal} de @${x.user ?? "?"}: "${cut(x.texto, 220)}"\nResposta proposta: ${resp}${ag}\n\nResponda "ok ${it.n}" para enviar ou "não ${it.n}" para descartar.`;
  }
  if (it.tipo === "humano") return `PRECISA DE VOCÊ - ${canal} de @${x.user ?? "?"}: "${cut(x.texto, 300)}"\nMotivo: ${p.motivo}. Responda direto pelo app do Instagram.`;
  if (it.tipo === "agendamento") { const d = p.dados; return `PRÉ-AGENDADO ${rotulo(d.horario_escolhido)} (${d.modalidade})\n${d.nome} - ${d.imobiliaria}, ${d.cidade}${d.corretores ? `, ${d.corretores} corretores` : ""}\nWhatsApp: ${d.whatsapp} | @${x.user ?? "?"}\nConfirme no WhatsApp.`; }
  return `AVISO #${it.n}: ${p.motivo} (@${x.user ?? "?"})`;
}

// Entrega os avisos pendentes enquanto a janela de 24 h do dono estiver aberta.
async function entregarAvisos() {
  const pend = st.itens.filter((i) => !i.avisado);
  if (!pend.length || !dono().igsid) { if (pend.length) log(`avisos pendentes=${pend.length} (conversa do dono ainda não vista)`); return; }
  const aberta = janelaDono() > 0;
  let tentouTag = false, n = 0;
  for (const it of pend) {
    if (n >= (L.avisos_por_execucao || 8)) break;
    if (!aberta && tentouTag) break;
    let txt = await textoAviso(it);
    if (aberta && janelaDono() < 3 * H) txt += "\n(responda qualquer coisa pra manter o canal aberto)";
    const ok = await enviarDM({ id: dono().igsid }, txt, { tag: !aberta });
    if (!aberta) tentouTag = true;
    if (!ok) { if (!aberta) break; c.erros++; break; }
    it.avisado = true; n++; c.avisos_enviados++;
  }
  const resto = st.itens.filter((i) => !i.avisado).length;
  if (resto) log(`avisos ainda pendentes=${resto} janela_dono=${aberta ? "aberta" : "fechada"}`);
}

// ---------- Comandos do dono ----------
const nz = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
async function aprovar(it) {
  const p = dec(it.enc);
  if (!p) return "Não consegui ler o rascunho (a chave mudou?). Descartei.";
  if (p.pre && ocupados().includes(p.dados.horario_escolhido)) { it.status = "descartado"; return `Não enviei: o horário ${rotulo(p.dados.horario_escolhido)} já foi ocupado. Descartei.`; }
  let ok;
  if (it.ref.kind === "dm") ok = await enviarDM({ id: p.dest }, p.resposta, { aprovado: true });
  else {
    ok = await responderComentario(it.ref.id, p.pub, true);
    if (ok && p.dm) ok = await ig("POST", `/${UID}/messages`, { recipient: { comment_id: it.ref.id }, message: { text: p.dm } }).then((r) => r.ok);
  }
  if (!ok) return `Falhou ao enviar #${it.n} (veja o log do Actions: só o código da Meta aparece).`;
  it.status = "enviado"; c.dms_respondidas++; st.cont.respondidas++;
  if (p.pre) { st.agendados.push(p.dados.horario_escolhido); st.cont.agendamentos++; novoItem("agendamento", it.ref, { dados: p.dados }); }
  return `Enviado #${it.n}.`;
}
async function comando(txt) {
  const t = nz(txt);
  const abertos = st.itens.filter((i) => i.tipo === "rascunho" && i.status === "aberto");
  if (t === "status") return `Modo: ${modo()}. Rascunhos abertos: ${abertos.length}. Avisos pendentes: ${st.itens.filter((i) => !i.avisado).length}. Horários pré-agendados futuros: ${st.agendados.length}. Totais: ${st.cont.respondidas} respondidas, ${st.cont.rascunhos} rascunhos, ${st.cont.ignorados} ignorados, ${st.cont.humano} para humano, ${st.cont.agendamentos} agendamentos.`;
  if (t === "ativar") { st.bot_mode = "ativo"; return "Modo ATIVO ligado: agora respondo clientes de verdade. Mande \"ensaio\" para voltar ou \"pausar\" para parar."; }
  if (t === "ensaio") { st.bot_mode = "ensaio"; return "Modo ENSAIO: não respondo clientes, só te mando rascunhos."; }
  if (t === "pausar") { st.bot_mode = "pausado"; return "PAUSADO: não respondo ninguém. Mande \"ensaio\" ou \"ativar\" para voltar."; }
  let m = /^(ok|sim|enviar)\s+#?(\d+)$/.exec(t);
  if (m) { const it = abertos.find((i) => i.n === +m[2]); return it ? aprovar(it) : `Não achei o rascunho ${m[2]} aberto.`; }
  m = /^(nao|descartar|n)\s+#?(\d+)$/.exec(t);
  if (m) { const it = abertos.find((i) => i.n === +m[2]); if (!it) return `Não achei o rascunho ${m[2]} aberto.`; it.status = "descartado"; return `Descartado #${it.n}.`; }
  m = /^liberar\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/.exec(t);
  if (m) { st.agendados = st.agendados.filter((s) => s !== m[1]); return `Horário ${m[1]} liberado.`; }
  return "Comandos: status | ativar | ensaio | pausar | ok N | não N | liberar AAAA-MM-DD HH:mm";
}

// Acha a conversa do dono, guarda o IGSID, trata mensagens novas dele.
async function etapaDono(convs) {
  const alvo = cfg.owner_username.toLowerCase();
  const cv = convs.find((v) => (v.participants?.data || []).some((p) => p.username?.toLowerCase() === alvo) || (v.messages?.data || []).some((m) => m.from?.username?.toLowerCase() === alvo));
  if (!cv) { log("conversa do dono: NÃO vista (ele precisa mandar um oi para a conta)"); return null; }
  const msgs = (cv.messages?.data || []).filter((m) => m.from?.username?.toLowerCase() === alvo || m.from?.id === dono().igsid)
    .sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
  const ig0 = (cv.participants?.data || []).find((p) => p.username?.toLowerCase() === alvo)?.id || msgs[0]?.from?.id;
  if (ig0) dono().igsid = ig0;
  if (msgs.length) dono().lastMsgAt = Math.max(dono().lastMsgAt || 0, new Date(msgs[msgs.length - 1].created_time).getTime());
  for (const m of msgs) {
    if (st.messages[m.id]) continue;
    st.messages[m.id] = Date.now();
    if (!m.message || new Date(m.created_time).getTime() < Date.now() - 24 * H) continue; // mensagem velha: janela fechada, não dá para responder
    c.comandos_dono++;
    const resp = await comando(m.message);
    let txt = resp;
    if (janelaDono() < 3 * H) txt += "\n(responda qualquer coisa pra manter o canal aberto)";
    await enviarDM({ id: dono().igsid }, txt);
  }
  return cv.id;
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
      let pub, dm = null;
      if (kw) { pub = rand(cfg.resposta_publica_palavra_chave); dm = cfg.abertura_direct; }
      else {
        let ia;
        try { ia = await pensar({ canal: "comentario", historico: [{ de: "cliente", texto: k.text }], livres: livres(), confusos: 0 }, cfg); }
        catch (e) { log("gemini indisponível:", e.message); return; }
        if (ia.acao === "ignorar") { c.ignorados++; st.cont.ignorados++; st.comments[k.id] = Date.now(); continue; }
        if (ia.precisa_humano) { c.humano++; st.cont.humano++; novoItem("humano", { kind: "cm", id: k.id }, { motivo: ia.motivo || ia.intencao }); st.comments[k.id] = Date.now(); continue; }
        pub = ia.resposta;
      }
      budget--;
      if (modo() !== "ativo") { novoItem("rascunho", { kind: "cm", id: k.id }, { pub, dm }); c.rascunhos++; st.cont.rascunhos++; st.comments[k.id] = Date.now(); continue; }
      if (await responderComentario(k.id, pub)) c.resp_publicas++; else c.erros++;
      if (dm) {
        const r2 = await ig("POST", `/${UID}/messages`, { recipient: { comment_id: k.id }, message: { text: dm } });
        if (r2.ok) c.directs_de_comentario++; else { log(`private reply falhou http=${r2.status} ${r2.err}`); c.erros++; novoItem("falha", { kind: "cm", id: k.id }, { motivo: "private reply falhou" }); }
      }
      st.cont.respondidas++;
      st.comments[k.id] = Date.now();
    }
  }
}

// ---------- Directs de clientes ----------
async function directs(convs, donoConvId) {
  for (const cv of convs) {
    if (cv.id === donoConvId) continue; // a conversa do dono NUNCA passa pelo cérebro de vendas
    const msgs = [...(cv.messages?.data || [])].sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
    const doCliente = msgs.filter((m) => m.from?.id !== UID);
    const novas = doCliente.filter((m) => !st.messages[m.id]);
    if (!novas.length) continue;
    const ultima = msgs[msgs.length - 1], ultCli = doCliente[doCliente.length - 1];
    const marcar = () => novas.forEach((m) => (st.messages[m.id] = Date.now()));
    if (ultima.from?.id === UID) { marcar(); continue; }
    if (Date.now() - new Date(ultCli.created_time) > 23.5 * H) { marcar(); continue; } // fora da janela de 24 h
    if (budget <= 0) return;
    const h = sha(cv.id);
    const cs = st.convs[h] ?? (st.convs[h] = { t: Date.now(), day: hoje(), n: 0, confuso: 0, humano: false });
    if (cs.day !== hoje()) { cs.day = hoje(); cs.n = 0; }
    cs.t = Date.now();
    if (cs.humano) { marcar(); continue; }
    const hist = msgs.map((m) => ({ de: m.from?.id === UID ? "nos" : "cliente", texto: (m.message || "[anexo/mídia sem texto]").slice(0, 800) }));
    let res;
    if (cs.n >= L.respostas_por_conversa_por_dia) res = { resposta: HUMANO, precisa_humano: true, pre_agendado: false, dados: {}, intencao: "humano", motivo: "limite diário de respostas na conversa" };
    else { try { res = await pensar({ canal: "direct", historico: hist, livres: livres(), confusos: cs.confuso }, cfg); } catch (e) { log("gemini indisponível:", e.message); return; } }
    budget--;
    cs.confuso = res.entendeu === false ? cs.confuso + 1 : 0;
    if (cs.confuso >= 2 && !res.precisa_humano) { res.precisa_humano = true; res.resposta = HUMANO; res.pre_agendado = false; res.motivo = "2 respostas seguidas sem entender"; }
    const d = res.dados || {}, ref = { kind: "dm", id: ultCli.id };
    let texto = res.resposta;
    if (res.pre_agendado && ocupados().includes(d.horario_escolhido)) { texto = `Esse horário acabou de ser ocupado. Consigo ${livres().slice(0, 2).map(rotulo).join(" ou ")}. Qual prefere?`; res.pre_agendado = false; }
    if (res.precisa_humano) { c.humano++; st.cont.humano++; cs.humano = true; novoItem("humano", ref, { motivo: res.motivo || res.intencao }); }
    if (modo() !== "ativo") {
      novoItem("rascunho", ref, { dest: ultCli.from.id, resposta: texto, pre: !!res.pre_agendado, dados: d });
      c.rascunhos++; st.cont.rascunhos++; cs.n++; marcar();
      continue;
    }
    const ok = await enviarDM({ id: ultCli.from.id }, texto);
    if (ok) {
      c.dms_respondidas++; st.cont.respondidas++; cs.n++;
      if (res.pre_agendado) { st.agendados.push(d.horario_escolhido); c.agendamentos++; st.cont.agendamentos++; novoItem("agendamento", ref, { dados: d }); }
    } else { c.erros++; novoItem("falha", ref, { motivo: "falha ao enviar resposta" }); }
    marcar();
  }
}

try {
  const r = await ig("GET", `/${UID}/conversations`, { platform: "instagram", fields: "id,updated_time,participants,messages.limit(15){id,message,from,created_time}", limit: 25 });
  if (!r.ok) { log(`ler conversas falhou http=${r.status} ${r.err}`); c.erros++; }
  const convs = r.ok ? r.j.data || [] : [];
  const donoConv = await etapaDono(convs);
  if (modo() !== "pausado") { await comentarios(); await directs(convs, donoConv); }
  await entregarAvisos();
} catch (e) { c.erros++; log("erro inesperado:", redact(e.message)); }
finally {
  saveState(st);
  log(`resumo modo=${modo()} ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ")} gemini_chamadas=${stats.chamadas}`);
}

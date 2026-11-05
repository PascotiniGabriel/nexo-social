// Teste local do roteamento e dos comandos do dono. Tudo simulado (API da Meta e cérebro), nada é enviado.
// Uso: node scripts/ig-bot/test-bot.mjs
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.IG_USER_ID = "BOT"; process.env.IG_ACCESS_TOKEN = "x"; process.env.GEMINI_API_KEY = "chave-de-teste";
const STATE = join(tmpdir(), "igbot-test-state.json");
process.env.STATE_FILE = STATE;
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
let falhas = 0, run = 0;
const ok = (c, nome) => { console.log(`${c ? "PASS" : "FAIL"} ${nome}`); if (!c) falhas++; };
const reset = () => existsSync(STATE) && unlinkSync(STATE);

let convs, sends, brainCalls, rejectTag;
const msg = (id, de, user, texto, h) => ({ id, message: texto, from: { id: de, username: user }, created_time: ago(h) });
globalThis.__BRAIN_MOCK = (ctx) => {
  brainCalls.push(ctx.historico.at(-1).texto);
  const t = ctx.historico.at(-1).texto;
  if (/agendar/.test(t)) return { resposta: "Pré-agendado para sexta às 9h. O Gabriel confirma no seu WhatsApp.", intencao: "agendar", acao: "responder", entendeu: true, precisa_humano: false, pre_agendado: true, dados: { nome: "Ana", imobiliaria: "Lar", cidade: "Santa Maria", corretores: null, whatsapp: "55999991234", modalidade: "online", horario_escolhido: ctx.livres[0] } };
  return { resposta: "Plano Leads R$ 497/mês. Quer ver numa demonstração?", intencao: "preco", acao: "responder", entendeu: true, precisa_humano: false, pre_agendado: false, dados: {} };
};
globalThis.__IG_MOCK = (method, path, params) => {
  const r = (j, okk = true) => ({ ok: okk, status: okk ? 200 : 400, j, err: okk ? "" : "code=10" });
  if (method === "POST" && path === "/BOT/messages") {
    if (params.tag && rejectTag) return r({}, false);
    sends.push({ para: params.recipient.id ?? "comment:" + params.recipient.comment_id, texto: params.message.text, tag: params.tag });
    return r({ message_id: "m" });
  }
  if (method === "GET" && path === "/BOT") return r({ username: "nexoimob.ia" });
  if (method === "GET" && path === "/BOT/media") return r({ data: [] });
  if (method === "GET" && path === "/BOT/conversations") return r({ data: convs });
  const m = convs.flatMap((c) => c.messages.data).find((x) => "/" + x.id === path);
  if (m) return r(m);
  return r({}, false);
};
const rodar = async () => { sends = []; brainCalls = []; await import(`./bot.mjs?run=${++run}`); };
const estado = () => JSON.parse(readFileSync(STATE, "utf8"));
// o módulo roda uma vez por import; cada import = uma execução do cron
const dono = (h, extra = []) => ({ id: "cvDono", participants: { data: [{ id: "OWN", username: "Gabriel_Pascotini" }, { id: "BOT", username: "nexoimob.ia" }] }, messages: { data: [msg("o1", "OWN", "Gabriel_Pascotini", "oi", h), ...extra] } });
const cliente = (txt, id = "c1") => ({ id: "cv" + id, participants: { data: [{ id: "CLI" + id, username: "maria" }] }, messages: { data: [msg(id, "CLI" + id, "maria", txt, 0.2)] } });
const aDono = () => sends.filter((s) => s.para === "OWN");
const aCliente = () => sends.filter((s) => s.para !== "OWN");

console.log("--- A: ensaio, janela do dono aberta ---");
reset(); convs = [dono(1), cliente("Quanto custa?")];
await rodar();
ok(aCliente().length === 0, "ensaio: nada enviado ao cliente");
ok(brainCalls.length === 1 && brainCalls[0] === "Quanto custa?", "cérebro só viu a mensagem do cliente (conversa do dono nunca entra)");
ok(aDono().some((s) => /^#1 Direct de @maria/.test(s.texto) && /ok 1/.test(s.texto)), "dono recebeu rascunho numerado #1 com mensagem do cliente e resposta");
ok(!JSON.stringify(estado()).includes("Quanto custa") && !JSON.stringify(estado()).includes("maria"), "estado não contém texto nem nome do cliente");
ok(estado().owner.igsid === "OWN", "IGSID do dono guardado (username case-insensitive)");
ok(!aDono().some((s) => /manter o canal aberto/.test(s.texto)), "sem rodapé quando faltam mais de 3 h");

console.log("--- B: dono responde 'status' e 'ok 1' ---");
convs = [dono(1, [msg("o2", "OWN", "Gabriel_Pascotini", "Status", 0.1), msg("o3", "OWN", "Gabriel_Pascotini", "ok 1", 0.05)]), cliente("Quanto custa?")];
await rodar();
ok(aDono().some((s) => /^Modo: ensaio/.test(s.texto)), "status respondido");
ok(aCliente().length === 1 && aCliente()[0].para === "CLIc1" && /R\$ 497/.test(aCliente()[0].texto), "'ok 1' enviou o rascunho ao cliente");
ok(brainCalls.length === 0, "mensagem já tratada não repassa pelo cérebro");

console.log("--- C: não N, ativar, pausar ---");
convs = [dono(1, [msg("o4", "OWN", "Gabriel_Pascotini", "Ativar", 0.1)]), cliente("Quero agendar", "c2")];
await rodar();
ok(estado().bot_mode === "ativo", "'ativar' grava bot_mode=ativo");
ok(aCliente().length === 1, "comando do dono vale já na mesma execução (cliente respondido em modo ativo)");
reset(); convs = [dono(1, [msg("o5", "OWN", "Gabriel_Pascotini", "pausar", 0.1)]), cliente("Quanto custa?", "c3")];
await rodar();
ok(estado().bot_mode === "pausado" && brainCalls.length === 0 && aCliente().length === 0, "'pausar': ninguém é respondido");
convs = [dono(1, [msg("o6", "OWN", "Gabriel_Pascotini", "pausar", 0.1), msg("o7", "OWN", "Gabriel_Pascotini", "ensaio", 0.05)]), cliente("Quanto custa?", "c3")];
await rodar();
ok(estado().bot_mode === "ensaio" && aCliente().length === 0, "'ensaio' volta ao modo ensaio");
convs = [dono(1, [msg("o8", "OWN", "Gabriel_Pascotini", "não 1", 0.01)]), cliente("Quanto custa?", "c3")];
await rodar();
ok(aDono().some((s) => /Descartado #1/.test(s.texto)), "'não 1' descarta");

console.log("--- D: ativo, cliente agenda ---");
reset(); writeFileSync(STATE, JSON.stringify({ bot_mode: "ativo", owner: { igsid: "OWN", lastMsgAt: Date.now() - 3 * 36e5 } }));
convs = [dono(3), cliente("quero agendar", "c4")];
await rodar();
ok(aCliente().length === 1 && /Pré-agendado/.test(aCliente()[0].texto), "ativo: cliente recebe confirmação");
ok(aDono().some((s) => /PRÉ-AGENDADO/.test(s.texto) && /55999991234/.test(s.texto)), "dono recebe aviso de agendamento com dados remontados");
ok(estado().agendados.length === 1 && !JSON.stringify(estado()).includes("55999991234") && !JSON.stringify(estado()).includes("Ana"), "slot guardado sem dado pessoal");

console.log("--- E: janela do dono quase fechando (22 h) ---");
reset(); convs = [dono(22), cliente("Quanto custa?", "c5")];
await rodar();
ok(aDono().length >= 1 && aDono().every((s) => /manter o canal aberto/.test(s.texto)), "rodapé 'mantenha o canal aberto' presente");

console.log("--- F: janela fechada (30 h), tag recusada ---");
reset(); rejectTag = true; convs = [dono(30), cliente("Quanto custa?", "c6")];
await rodar();
ok(aDono().length === 0 && aCliente().length === 0, "nada enviado; aviso fica pendente");
ok(estado().itens.some((i) => !i.avisado), "aviso permanece na fila");
rejectTag = false;
convs = [dono(30, [msg("o9", "OWN", "Gabriel_Pascotini", "oi de novo", 0.05)]), cliente("Quanto custa?", "c6")];
await rodar();
ok(aDono().some((s) => /^#1/.test(s.texto)), "dono volta a escrever: fila entregue");

console.log("--- G: conversa do dono não vista ---");
reset(); convs = [cliente("Quanto custa?", "c7")];
await rodar();
ok(sends.length === 0, "sem conversa do dono: nenhum envio (ensaio)");
ok(estado().itens.length === 1, "rascunho aguarda na fila");

reset();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);

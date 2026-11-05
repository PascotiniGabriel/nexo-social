# Atendente IA do Instagram (@nexoimob.ia) - guia do dono

## O que ele faz
- A cada 10 minutos olha comentários dos posts e directs.
- Comentou uma palavra do post (NEXO, PAINEL, TOUR, MATCH...): resposta pública "Te chamei no direct!" e primeira mensagem no direct.
- Outros comentários: responde só pergunta, elogio ou dúvida. Spam e ofensa são ignorados.
- No direct: conversa curto, tira dúvida e tenta marcar demonstração de 30 a 40 min (online ou presencial), pegando nome, imobiliária, cidade, WhatsApp, modalidade e horário. Fecha como "pré-agendado, o Gabriel confirma no seu WhatsApp".
- Reclamação, xingamento, contrato, imprensa, parceria, pedido de gente, ou 2 respostas sem entender: avisa "vou chamar o Gabriel" e fica em silêncio naquela conversa. Máximo de 8 respostas por conversa por dia.
- Nunca dá desconto, nunca cita outros sistemas, nunca inventa funcionalidade; preço só se perguntarem.

## Como você fala com ele: pelo seu Instagram
Tudo chega no seu direct (@gabriel_pascotini), enviado pela conta @nexoimob.ia. Não há e-mail, nem issue, nem token extra.
**Passo único para abrir o canal: mande um "oi" de @gabriel_pascotini para @nexoimob.ia.** O Instagram só deixa a conta responder até 24 horas depois da sua última mensagem. Se passar disso, os avisos ficam guardados e chegam assim que você escrever de novo. Quando faltar menos de 3 h, o aviso termina com "(responda qualquer coisa pra manter o canal aberto)". Se mandar qualquer mensagem de vez em quando (ex.: "status"), o canal fica aberto.

Comandos (maiúscula ou minúscula, tanto faz):
- status: mostra o modo e as contagens.
- ensaio: ele NÃO responde clientes; só te manda rascunhos numerados (#3 com a mensagem do cliente e a resposta proposta).
- ok 3: envia de verdade o rascunho 3. não 3: descarta.
- ativar: passa a responder clientes sozinho. ensaio: volta ao ensaio. pausar: não responde ninguém.
- liberar 2026-11-10 09:00: libera um horário que ele marcou como ocupado.
Só você consegue mudar o modo (ele reconhece o nome @gabriel_pascotini).

## Modo ENSAIO (já vem assim)
Em ensaio o único envio é para você (e os rascunhos que você aprovar com "ok N"). Veja alguns rascunhos e, quando estiver confiante, mande "ativar".

## Privacidade
O repositório é público. Nele ficam só números de identificação, os horários já pré-agendados e, quando necessário, rascunhos CIFRADOS (só o bot, com a chave Gemini, consegue ler). Nome, telefone e texto de cliente não ficam em arquivo nem no log: o aviso é remontado na hora lendo o Instagram.

## Como mudar regras e agenda
Edite pela tela do GitHub (lápis no arquivo, "Commit changes") em scripts/ig-bot:
- regras.md: o que pode e não pode falar, tom, quando chamar humano.
- config.json: palavras-chave, frases públicas, mensagem de abertura do direct, preços, limites e a agenda (dias_uteis 1=seg...5=sex, inicios, feriados no formato "2026-12-25", duracao_min) e owner_username.

## Como ligar
1. Crie o segredo GEMINI_API_KEY no repositório nexo-social (Settings > Secrets and variables > Actions > New repository secret). Os segredos IG_ACCESS_TOKEN e IG_USER_ID já existem. Nenhum outro é necessário.
2. Ligue o workflow: Actions > "Atendente IA do Instagram" > Enable workflow.
3. Mande o "oi" para a conta (acima). Para desligar tudo: Disable workflow.

## Permissões do Instagram
O diagnóstico (Actions > ig-bot-check) mostrou que o token tem instagram_manage_comments e instagram_manage_messages e que consegue ler mídias e conversas. NÃO foi possível confirmar sem mandar mensagem real: o envio de DMs (inclusive os avisos a você). Se falhar, o log mostra o código da Meta. Então:
- Business Manager > Configurações do negócio > Usuários do sistema > seu usuário > Adicionar ativos: a conta do Instagram com controle total (e a Página vinculada, se houver).
- Gerar novo token marcando instagram_manage_comments, instagram_manage_messages, instagram_basic, instagram_content_publish (e pages_messaging e pages_show_list se aparecerem). Troque o segredo IG_ACCESS_TOKEN.
- No Instagram: Configurações > Mensagens > ferramentas conectadas > "Permitir acesso a mensagens" (não verificado, o nome da tela varia).
- O app Meta pode precisar estar em modo Live para DMs de quem não é testador (não verificado).

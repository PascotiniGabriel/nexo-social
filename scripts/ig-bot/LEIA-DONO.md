# Atendente IA do Instagram (@nexoimob.ia) - guia do dono

## O que ele faz
- Olha os comentários dos seus posts e as mensagens diretas (directs) a cada 10 minutos.
- Comentou uma palavra do post (NEXO, PAINEL, TOUR, MATCH...): responde "Te chamei no direct!" e manda a primeira mensagem no direct.
- Comentou outra coisa: responde só se for pergunta, elogio ou dúvida. Spam e ofensa ele ignora.
- No direct: conversa curto, tira dúvida sobre o Nexo e tenta marcar uma demonstração de 30 a 40 min (online ou presencial). Pega nome, imobiliária, cidade, WhatsApp, modalidade e horário.
- Quando fecha, diz "pré-agendado, o Gabriel confirma no seu WhatsApp" e faz abrir um aviso (issue) no repositório PRIVADO nexo-imob-saas com a etiqueta "agendamento". Esse aviso tem os dados do cliente. Horário já ocupado não é oferecido de novo.
- Reclamação, xingamento, contrato, imprensa, parceria, pedido de falar com gente, ou 2 respostas sem entender: ele avisa "vou chamar o Gabriel" e abre um aviso com a etiqueta "instagram-humano". Depois disso ele fica em silêncio naquela conversa.
- Máximo de 8 respostas por conversa por dia.
- Ele nunca dá desconto, nunca cita outros sistemas, nunca inventa funcionalidade e só fala preço se perguntarem.
- Nada de dado de cliente fica neste repositório (que é público). O arquivo ig-bot-state.json guarda só números de identificação.

## Modo ENSAIO (já vem assim)
No ensaio ele NÃO envia nada ao Instagram. Cada resposta que ele daria vira um aviso no repositório privado nexo-imob-saas com a etiqueta "ig-ensaio". Leia vários, veja se o tom e as respostas estão bons, e só então ative.

## Como mudar as regras e a agenda
Edite pela tela do GitHub (lápis no arquivo, depois "Commit changes"), na pasta scripts/ig-bot:
- regras.md: o que ele pode e não pode falar, o tom, quando chamar o humano. É texto normal em português.
- config.json: palavras-chave (palavras_chave), as frases de resposta pública, a mensagem de abertura do direct (abertura_direct), preços, limites e a agenda:
  - dias_uteis: 1 = segunda ... 5 = sexta
  - inicios: horários de início das demonstrações
  - feriados: datas que não devem ser oferecidas, no formato "2026-12-25"
  - duracao_min: duração da demonstração

## Como ativar (uma vez)
1. Crie o segredo GEMINI_API_KEY: no repositório nexo-social, Settings > Secrets and variables > Actions > New repository secret. Nome GEMINI_API_KEY, valor é a chave do Gemini.
2. Crie o token do GitHub para o bot escrever avisos no repositório privado:
   - GitHub > sua foto > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
   - Resource owner: PascotiniGabriel. Repository access: Only select repositories > nexo-imob-saas.
   - Permissions > Repository permissions > Issues: Read-only e Contents: Read and write (o Contents é exigido para o bot avisar o repositório privado). Mais nada.
   - Os avisos chegam por e-mail: o repositório privado tem o workflow ig-bot-inbox.yml, que cria as issues como github-actions[bot]. Deixe o repositório nexo-imob-saas em Watch > All Activity (ou Custom > Issues).
   - Gere, copie e cole como segredo com o nome GH_PAT (mesma tela do passo 1).
3. Os segredos IG_ACCESS_TOKEN e IG_USER_ID já existem.
4. Ligue o workflow: aba Actions > "Atendente IA do Instagram" > "Enable workflow". Clique em "Run workflow" para testar na hora.
5. Fique em ENSAIO por alguns dias e leia os avisos "ig-ensaio".
6. Para valer de verdade: Settings > Secrets and variables > Actions > aba Variables > New repository variable. Nome BOT_MODE, valor ativo. Para voltar ao ensaio, apague a variável ou troque o valor para ensaio.
Para desligar tudo: Actions > "Atendente IA do Instagram" > menu "..." > Disable workflow.

## Permissões do Instagram (conferido em 05/11/2026)
O diagnóstico (Actions > ig-bot-check) mostrou que o token tem instagram_manage_comments e instagram_manage_messages, e consegue ler mídias e conversas. NÃO foi possível confirmar sem enviar mensagem real: o envio de respostas (resposta pública em comentário e mensagem no direct). Isso só será testado quando você ativar. Se o envio falhar, o bot abre um aviso "instagram-humano" e o log mostra o código de erro da Meta. Se acontecer:
- Business Manager > Configurações do negócio > Usuários > Usuários do sistema > seu usuário > Adicionar ativos: garanta a conta do Instagram com controle total e, se houver, a Página do Facebook vinculada.
- No mesmo usuário do sistema: Gerar novo token, escolhendo o app e marcando instagram_manage_comments, instagram_manage_messages, instagram_basic, instagram_content_publish e, se aparecer, pages_messaging e pages_show_list. Troque o segredo IG_ACCESS_TOKEN pelo novo.
- No app do Instagram: Configurações > Mensagens e respostas de histórias (ou Privacidade > Mensagens) > Ferramentas conectadas > ligar "Permitir acesso a mensagens". Este passo eu NÃO verifiquei e o nome da tela varia.
- Limite da Meta: só dá para responder no direct até 24 horas depois da última mensagem do cliente (o bot respeita isso). O app Meta pode precisar estar em modo "Ativo" (Live) para receber mensagens de pessoas que não são testadoras: NÃO verifiquei.

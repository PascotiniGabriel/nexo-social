# Publicador automático do Instagram (Nexo Imob)

Este repositório é público de propósito: o Instagram só consegue buscar vídeos e imagens em endereços públicos (https). Aqui ficam apenas os vídeos/imagens já prontos para postar e a fila de publicação. Nenhuma senha ou chave fica salva aqui.

Como funciona: a cada 30 minutos o GitHub roda `scripts/publish.mjs`. Ele olha `queue.json`, pega o que está "pendente" e já passou do horário, publica no Instagram e anota o resultado. A página `index.html` (GitHub Pages) mostra a "Fila da semana" para você revisar.

> Regra de ouro: nunca cole token ou senha em conversa, e-mail ou arquivo. Tokens entram só pela tela de Secrets do GitHub (passo 5).

## Passo a passo (uma vez só)

Itens marcados com **[NÃO VERIFICADO]** não consegui confirmar na documentação oficial; a tela da Meta muda com frequência, então siga o que aparecer e, se algo for diferente, me avise.

### 1. Conta do Instagram profissional
1. No app do Instagram: Configurações > Tipo de conta e ferramentas > Mudar para conta profissional (escolha "Empresa").
2. Confirme que a conta é a que vai postar o conteúdo do Nexo.

### 2. App na Meta for Developers
1. Entre em https://developers.facebook.com com o seu Facebook e aceite os termos de desenvolvedor (cadastro gratuito). **[NÃO VERIFICADO]** exigência de verificação do telefone.
2. "Meus apps" > "Criar app". Tipo/caso de uso: o que permita usar a **API do Instagram** (Instagram API com login do Instagram, "Instagram API with Instagram Login"). O nome dos botões pode variar.
3. No painel do app, abra o produto **Instagram** > **API setup with Instagram login**.
4. Permissões necessárias (confirmadas na documentação oficial): `instagram_business_basic` e `instagram_business_content_publish`.

### 3. Dar acesso à sua conta de Instagram
Na documentação oficial, contas que você é dono e adiciona ao app usam acesso "Standard" (confirmado). Em "Instagram API setup" use "Add account" (ou adicione a conta em Funções do app como Testador/Administrador) e aceite o convite no Instagram (Configurações > Apps e sites > Convites de testador). **[NÃO VERIFICADO]** o caminho exato da tela de convite e se o app precisa estar em modo "Ativo/Live" ou passar por revisão para publicar na própria conta.

### 4. Gerar o token de longa duração
1. No painel (Instagram API setup), em "Generate access token", gere o token da sua conta. **[NÃO VERIFICADO]** a existência desse botão para o seu tipo de app; a alternativa oficial é o fluxo de login do Instagram, que gera um token curto, e depois trocá-lo por um de 60 dias em `https://graph.instagram.com/access_token` com `grant_type=ig_exchange_token` (chamada feita no servidor, com o "app secret", que nunca deve ser exposto).
2. Anote também o **ID da conta do Instagram** (IG_USER_ID, aparece no mesmo painel).
3. O token dura 60 dias e é renovado sozinho todo mês pelo workflow `refresh-token.yml` (renovação só funciona com token de pelo menos 24 horas e ainda válido: confirmado na documentação).

### 5. Guardar os segredos no GitHub (pela tela, nunca no chat)
No repositório: Settings > Secrets and variables > Actions > New repository secret. Crie:
- `IG_USER_ID`: o ID da conta do Instagram.
- `IG_ACCESS_TOKEN`: o token de longa duração.
- `GH_PAT`: um token do GitHub (Settings da sua conta > Developer settings > Personal access tokens > Fine-grained) com permissão de escrita em **Secrets** deste repositório. Serve só para o workflow guardar o token renovado.

### 6. Ligar o GitHub Pages
Settings > Pages > Source: "Deploy from a branch" > branch `main`, pasta `/ (root)` > Save. O endereço será `https://SEU-USUARIO.github.io/NOME-DO-REPO/`. Esse endereço é a sua "Fila da semana". Se usar outro endereço, defina a variável `MEDIA_BASE_URL` no workflow.

### 7. Teste sem publicar
Actions > "Publicar no Instagram" > Run workflow > marque "Simulação" > Run. Deve listar os itens vencidos e dizer "publicaria ...", sem postar nada.

## Rotina da semana (feita pelo Claude)
1. No repositório privado: `node video/scripts/semana.mjs content/semanas/AAAA-WNN.json` gera vídeos e imagens.
2. `node publisher/repo-template/scripts/enqueue.mjs AAAA-WNN` copia a mídia para `media/` e acrescenta na `queue.json`.
3. Commit e push neste repositório. Você revisa em `index.html`. Se quiser cancelar algo, edite o `status` do item para `"cancelado"` (ou apague) antes do horário.

## Detalhes técnicos
- Fila: `queue.json` = lista de `{id, type: "reel"|"carousel", media:[...], cover?, caption, publish_at, status: "pendente"|"publicado"|"erro", ig_media_id?, error?}`.
- Reel: container `media_type=REELS` com `video_url`, `caption`, `cover_url`, `share_to_feed`. Carrossel: um container por imagem (`is_carousel_item=true`), depois o container pai `CAROUSEL` com `children`. Em ambos: consulta `status_code` até `FINISHED`, depois `media_publish`. O limite de publicações da conta (`content_publishing_limit`) é consultado antes. Imagens precisam ser JPEG (confirmado na documentação). Endereço usado: `graph.instagram.com/v26.0` (versão que aparece nos exemplos oficiais).
- **[NÃO VERIFICADO]** na página principal: os parâmetros `cover_url` e `share_to_feed` (constam só na referência do endpoint), requisitos de vídeo (duração/tamanho/codec) e se o limite diário é 100 ou 50 posts (a documentação cita os dois valores em lugares diferentes; usamos no máximo 2 posts por ciclo e checamos a cota).
- Cada item tem até 3 tentativas; depois disso vira `erro` e para de tentar. Para tentar de novo, volte `status` para `"pendente"` e zere `attempts`.
- Teste local sem rede: `DRY_RUN=1 NOW=2026-11-01T00:00:00-03:00 node scripts/publish.mjs`.

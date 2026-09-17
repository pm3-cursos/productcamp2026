# Plataforma de Indicação — Product Camp 2026

Programa de indicação (member-get-member) do evento. Quem comprou **Passaporte**
indica amigos usando o próprio e-mail como cupom; quando as indicações somam
**3 ingressos**, a pessoa qualifica para o upgrade gratuito para VIP. O prêmio
vale para os **50 primeiros** que baterem a marca, e a liberação é **manual**,
feita pelo time PM3.

A fonte de verdade é a **planilha de vendas de eventos no Google Sheets**,
espelhada no D1 compartilhado `pm3-eventos` pelo Worker
**`pm3-eventos-vendas-sync`** (repositório próprio; roda a cada 6 horas). A
plataforma lê a tabela `pedidos` desse Worker por HTTP, aplica as regras de
indicação e grava um snapshot no banco dela (`pcamp-indicacao`). As telas leem
só esse banco — nunca a planilha nem o Worker em tempo real.

```
Google Sheets ──(6/6 h)──► Worker pm3-eventos-vendas-sync ──► D1 pm3-eventos (tabela pedidos)
                                        │ callback ao fim de cada rodada          ▲ GET /pedidos?evento=Pcamp 2026
                                        ▼                                         │ (token só de leitura)
                     Pages Functions da indicação ─── regras ──► D1 pcamp-indicacao ──► telas
                       /api/sync/callback · /api/admin/sincronizar (botão)
                                        │
                        liberou VIP ──► webhook do n8n ──► linha de cortesia na planilha
```

Por que HTTP e não binding: o site vive na conta Cloudflare do
productcamp.com.br e o `pm3-eventos` na conta Admins@cursospm3 (com os outros
apps da PM3). Binding de D1 só funciona dentro da mesma conta.

---

## Como está montado

Roda no mesmo projeto do Cloudflare Pages do site, sem build:

| Onde | O quê |
| --- | --- |
| `indicacao/` | As telas (HTML/CSS/JS estáticos, sem framework) |
| `indicacao/app.css` | Tokens e componentes — os mesmos do design system do site |
| `functions/api/` | A API (Cloudflare Pages Functions) |
| `functions/_lib/` | Regras de negócio, leitura da planilha, sessão, e-mail, webhook |
| `functions/indicacao/*/[_middleware.js]` | Portões de acesso das páginas logadas |
| `functions/_lib/vendas.js` | Cliente HTTP do Worker de vendas; pedidos → matriz que `planilha.js` lê |
| `functions/_lib/snapshot.js` | Regras aplicadas → snapshot gravado no D1 (`gravarSnapshot`) |
| `functions/_lib/sincronizacao.js` | Uma rodada completa (usada pelo botão e pelo callback) |
| `indicacao/schema.sql` | Schema do banco (Cloudflare D1) |
| `_routes.json` (raiz) | Garante que só `/api/*` e as páginas logadas passam pelas Functions |
| `tests/` | Testes: `run.mjs` (unitários, sem dependências) e `e2e.mjs` (contra o servidor local) |

Rotas:

| Rota | Quem acessa |
| --- | --- |
| `/indicacao/` | Qualquer pessoa — tela de acesso |
| `/indicacao/entrar/?t=…` | Destino do link mágico, troca o token por sessão |
| `/indicacao/minha-pagina/` | Indicador logado |
| `/indicacao/pm3/` | Só os três e-mails do time PM3 |

O site do evento (`/`, `/pocket`, `/para-empresas/`, `/lives-pre-pcamp26/`)
continua 100% estático: nenhuma Function intercepta essas rotas (o
`_routes.json` na raiz garante isso por configuração), então o tempo de
carregamento da landing page não muda.

---

## Identidade visual

As telas usam o **design system do site**, não um tema próprio:

- O bloco `:root` de `indicacao/app.css` é o mesmo de `index.html`, copiado
  valor a valor (`--navy`, `--navy-card`, `--navy-border`, `--pink`, `--cyan`,
  `--white-70`, `--white-40`, …). Um teste de token não pega isso — se mexer
  nos tokens do site, atualize os dois.
- Tipografia: `InterTight` nos pesos 400 e 600, servida de `assets/fonts/`, a
  mesma da home. A plataforma não carrega nenhuma fonte extra.
- Componentes reaproveitados das páginas atuais: `nav` + `.nav-inner` +
  `.nav-logo` com o logo de `assets/img/brand/logo_escuro.svg`, `footer` +
  `.footer-inner`, `.btn-primary`, `.btn-secondary`, `.section-label` (com a
  barrinha ciano), `.container`, e os cards em `--navy-card` com raio 16px.
- Acento: ciano em rótulos e eyebrows, rosa em números e ações — a mesma
  divisão do site. O gradiente rosa→ciano da `.hero-rule` aparece na barra de
  progresso e nos marcadores das regras.
- **Única cor fora do design system:** o verde do WhatsApp (`--wa`), porque é
  a marca do canal de compartilhamento e o site não tem equivalente. Está
  comentada no CSS.

---

## A planilha (via `pedidos`)

O Worker de vendas espelha a aba de pedidos como ela é — todos os eventos,
cancelados marcados — na tabela `pedidos`. A plataforma pede só o evento
`Pcamp 2026` (`GET /pedidos?evento=…`) e converte cada pedido numa linha com
as colunas da planilha, para as regras continuarem escritas em termos dela:

`Data do Pedido · Nome · Sobrenome · E-mail · Lote · Número de Ingressos ·
Valor por ingresso · Valor total do pedido · Cupom · Categoria · Formato ·
Modalidade · Evento`

O que a plataforma lê:

| Coluna | Para quê |
| --- | --- |
| `Evento` | Só entram linhas com `Pcamp 2026` (a planilha é multi-evento) |
| `Número de Ingressos` | `CANCELADO` tira a linha de tudo; senão é quantos ingressos a compra vale |
| `Modalidade` | `Passaporte` pode indicar; quem também tem `VIP` fica de fora |
| `Formato` | Passaporte comprado como `B2B` (corporativo) não libera a indicação |
| `E-mail` | Identifica a pessoa (é o login e o cupom dela) |
| `Cupom` | Se for um e-mail, é uma indicação de quem tem esse e-mail |
| `Nome`, `Sobrenome` | Nome na tela e no ranking (o ranking mostra só `Nome`) |
| `Data do Pedido` | Ordena as indicações e define quem bateu a meta primeiro |
| `Valor total do pedido`, `Valor por ingresso` | Receita no painel |
| `Lote`, `Categoria` | Reconhecem a cortesia gravada pelo n8n (abaixo) |

Obrigatórias: `E-mail`, `Cupom`, `Modalidade`, `Evento`, `Número de Ingressos`.
Sem elas a sincronização para e diz qual falta. Nomes alternativos aceitos
estão em `functions/_lib/planilha.js`; os valores fixos (`Pcamp 2026`,
`Passaporte`, `VIP`, `CANCELADO`) em `functions/_lib/config.js`.

A planilha só tem compras confirmadas — não existe coluna de estado de
pagamento. Cancelamento é `CANCELADO` em `Número de Ingressos` (o Worker guarda
como `cancelado = 1`; a conversão devolve a marca). O Worker guarda só a data
do pedido, sem hora: `qualificou_em` fica no formato `YYYY-MM-DD`, e dois
indicadores que fecham a meta no mesmo dia desempatam por total e e-mail.

---

## Regras implementadas

1. Entram só as linhas do evento `Pcamp 2026` que não estão `CANCELADO`.
2. **Indicador** = tem ao menos uma compra `Passaporte` com `Formato` diferente de
   `B2B` e nenhuma compra `VIP`.
   Exceção: a linha de VIP com `Lote` = `VIP liberado por indicação - Cortesia`
   (ou `Categoria` = `Cortesia`) é o prêmio do próprio programa e **não** tira
   a pessoa da lista — o cupom dela continua ativo.
3. O cupom de cada indicador **é o e-mail dele**, puro, sem prefixo. Os 10% de
   desconto ficam configurados no cupom, na Sympla.
4. Uma compra **conta** para o indicador quando o `Cupom` é o e-mail dele e o
   comprador não é ele mesmo. Cupons que não são e-mail (`PCAMP10`) são
   ignorados; cupons de e-mail sem indicador aparecem no painel como "cupom sem
   indicador" para a organização revisar.
5. Cada compra vale `Número de Ingressos`. A meta é **3 ingressos indicados**.
6. `qualificou_em` é a **data da compra** que fez a soma chegar a 3 — derivada
   dos dados, igual em qualquer sincronização. É ela que ordena a fila dos 50.
7. A liberação do VIP é **manual**, no painel. Ao liberar, a plataforma avisa
   o n8n (webhook), que grava na planilha a linha de cortesia. Na próxima
   sincronização essa linha é lida como cortesia (regra 2) e a pessoa continua
   indicando.
8. Quem já tem ingresso VIP não entra como indicador e, por isso, não tem cupom.
9. "Só indicar quem ainda não comprou" é uma regra **comunicada** nas telas,
   não bloqueada pela plataforma.
10. O ranking mostra **só o primeiro nome**; a pessoa logada aparece como
    `Nome (Você)`. Nunca e-mail.
11. O indicador vê apenas as próprias indicações, o próprio progresso e a
    própria posição.

A regra mora em `functions/_lib/planilha.js` (leitura) e
`functions/_lib/reconciliacao.js` (contagem), em JavaScript puro e coberta por
teste. O script de sync roda essas mesmas funções em Node; as Functions só leem
o resultado gravado.

---

## Setup (uma vez)

### A. O Worker de vendas (repositório `pm3-eventos-vendas-sync`)

A conta de serviço do Google, a leitura da planilha e o D1 `pm3-eventos` são
responsabilidade do Worker — setup no README dele. O que a plataforma precisa
de lá:

1. A URL do Worker (`https://pm3-eventos-vendas-sync.<conta>.workers.dev`).
2. Um **token só de leitura** (`READ_TOKEN` no Worker) — dá acesso a
   `GET /pedidos` e `GET /status`, nunca ao `POST /sync`.
3. No Worker, `CALLBACK_URL = https://www.productcamp.com.br/api/sync/callback`
   e `CALLBACK_TOKEN` igual ao `SYNC_CALLBACK_TOKEN` daqui — é o que faz o
   painel se atualizar sozinho ao fim de cada espelhamento.

### B. Cloudflare — banco e variáveis

> **Estado em produção (14/09/2026):** o banco `pcamp-indicacao` já existe com
> o binding `DB`, as variáveis de e-mail e o `SESSION_SECRET`, só no ambiente
> Production. Ao publicar esta versão (pedidos → D1), falta: rodar o
> `schema-reset.sql` + `schema.sql` de novo e criar os secrets novos do Pages
> (`VENDAS_API_*`, `SYNC_CALLBACK_TOKEN`, `N8N_*`).

> ⚠️ **Confira a conta antes de rodar qualquer comando do Wrangler.** O projeto
> `productcamp2026` fica na conta da Cloudflare `7023d597cae5b2533647b58f8c05b290`
> (login `contato@productcamp.com.br`). O Wrangler usa a conta do login ativo:
> se ele estiver numa conta pessoal, o `d1 create` cria o banco lá, e esse banco
> não tem como ser ligado ao site. Rode `npx wrangler whoami` e, se o login
> enxergar mais de uma conta, fixe a certa:
>
> ```bash
> export CLOUDFLARE_ACCOUNT_ID=7023d597cae5b2533647b58f8c05b290
> ```

```bash
npx wrangler d1 create pcamp-indicacao
npx wrangler d1 execute pcamp-indicacao --remote --file=indicacao/schema.sql
```

O `schema.sql` é idempotente — pode rodar de novo sem perder dados. Rode-o de
novo sempre que ele mudar no repositório (tabela nova, índice novo).

> Se o banco foi criado com a versão anterior da plataforma (upload de
> planilha da Sympla), rode antes `indicacao/schema-reset.sql`: as tabelas de
> snapshot mudaram. Ele preserva `premios` (VIP liberado), `vip_log` e
> `magic_links`.

No projeto do Pages, **Settings → Bindings → Add → D1 database**:

- Variable name: `DB` ← exatamente esse
- D1 database: `pcamp-indicacao`

Faça isso **só em Production**. O Preview (o site temporário que a Cloudflare
sobe para cada PR) fica **sem banco, de propósito**: ligado ao mesmo banco,
qualquer teste feito numa preview — liberar VIP, disparar sincronização — iria
direto para os dados reais. Se um dia for preciso testar a plataforma em
preview, crie um banco separado (`pcamp-indicacao-preview`).

> Não existe `wrangler.toml` na raiz de propósito: a configuração de
> hospedagem vive no painel da Cloudflare (ver `CLAUDE.md`). O único arquivo
> de configuração do Wrangler é `tests/wrangler.e2e.toml`, usado só para o
> D1 **local** (testes).

**Settings → Variables and Secrets**, em Production:

| Variável | Tipo | Valor |
| --- | --- | --- |
| `SESSION_SECRET` | Secret | String aleatória de 32+ caracteres (`openssl rand -base64 32`). Trocar invalida todas as sessões |
| `MAIL_PROVIDER` | Texto | `resend` ou `sendgrid` |
| `MAIL_FROM` | Texto | `Product Camp 2026 <eventos@pm3.com.br>` — tem que terminar em `@pm3.com.br` (domínio verificado no Resend; o DMARC é estrito) |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | Secret | Conforme o provedor |
| `N8N_VIP_WEBHOOK_URL` | Secret | **Opcional.** URL do webhook do n8n que grava a cortesia na planilha. Sem ela a liberação do VIP funciona normalmente — o painel mostra `nao_configurado` e alguém lança a linha da cortesia à mão. Hoje produção roda sem essa variável. |
| `N8N_VIP_WEBHOOK_TOKEN` | Secret | Opcional — vai como `Authorization: Bearer` se o webhook exigir |
| `VENDAS_API_URL` | Texto | URL do Worker de vendas (passo A) |
| `VENDAS_API_TOKEN` | Secret | O `READ_TOKEN` do Worker — só leitura |
| `SYNC_CALLBACK_TOKEN` | Secret | O que o Worker manda em `Authorization: Bearer` ao chamar `/api/sync/callback` (`openssl rand -base64 32`) |

O domínio do remetente precisa estar verificado no provedor de e-mail, senão
os links mágicos caem em spam ou nem saem. Hoje o remetente é o **`pm3.com.br`**,
verificado na conta da PM3 no Resend — a `RESEND_API_KEY` precisa ser **dessa
mesma conta**. Atenção ao limite diário do plano do Resend: cada pedido de
acesso é um e-mail, e um convite em massa pode estourar o limite e travar o
login até ele renovar.

### C. Primeira carga

Com as variáveis no lugar (e o deploy feito), entre em `/indicacao/pm3/` e
clique **Atualizar dados**. Leva poucos segundos; a linha "Última
sincronização" mostra quantos pedidos vieram e quando o Worker leu a planilha.
Dali em diante o Worker chama o callback a cada rodada.

### D. Sem callback

Se o `CALLBACK_URL` não estiver configurado no Worker, nada quebra: os pedidos
continuam sendo espelhados a cada 6 h e o painel atualiza quando alguém clica
**Atualizar dados**. O callback só tira o clique do caminho.

### E. O webhook do n8n

Ao liberar um VIP, a plataforma faz `POST` em `N8N_VIP_WEBHOOK_URL` com este
JSON (as chaves são as colunas da planilha):

```json
{
  "Data do Pedido": "16/09/2026 14:05",
  "Nome": "Marina Castro",
  "E-mail": "marina.castro@email.com",
  "Lote": "VIP liberado por indicação - Cortesia",
  "Número de Ingressos": 1,
  "Valor por ingresso": 0,
  "Valor total do pedido": 0,
  "Cupom": "",
  "Categoria": "Cortesia",
  "Formato": "B2C",
  "Modalidade": "VIP"
}
```

O n8n deve gravar a linha na mesma aba de pedidos, com `Evento` = `Pcamp 2026`.
Se o webhook falhar, o VIP fica liberado mesmo assim, o painel mostra o aviso e
o resultado fica em `vip_log.webhook` — nesse caso o time preenche a linha à
mão.

---

## Operação do dia a dia

Nada a fazer: a planilha é espelhada a cada 6 horas e o painel se atualiza
logo em seguida (callback). Quando quiser ver uma compra recém-feita que já
esteja no espelho:

1. `/indicacao/pm3/` → **Atualizar dados**. Leva poucos segundos.
2. Conferir a linha "Última sincronização": linhas lidas, compras do evento,
   indicadores, qualificados e, se houver, **cupons de e-mail sem indicador**
   (alguém usou como cupom um e-mail que não tem Passaporte — revisar).
3. Liberar os upgrades VIP na coluna **VIP liberado** de quem qualificou.

A tabela mostra 20 indicadores por página (e 20 compras por página no detalhe
de cada um); a busca e os filtros voltam para a primeira página.

A sincronização é sempre uma **foto completa da planilha**: o que sumiu ou foi
marcado `CANCELADO` deixa de contar; o que voltou, volta a contar. Ela **nunca
toca em VIP liberado** — isso é decisão do time e só o botão do painel muda.

---

## Acesso

Dois perfis, decididos pelo e-mail:

- **Time PM3 (admin)** — allowlist fixa no código, em
  `functions/_lib/config.js`: hoje só a caixa compartilhada `eventos@pm3.com.br`.
  Quem tem acesso a essa caixa é admin (o controle real está no provedor de
  e-mail), e o `liberado_por` de todo VIP registra `eventos@`, não a pessoa.
  Mudar essa lista é mudar código, revisado por PR.
- **Indicador** — qualquer e-mail que a última sincronização colocou na tabela
  `indicadores` (Passaporte sem VIP).

E-mail digitado **não autentica**. A pessoa informa o e-mail, recebe um link de
uso único válido por 20 minutos e só entra ao clicar. A sessão vive num cookie
`HttpOnly; Secure; SameSite=Lax` assinado com HMAC-SHA256, válido por 12 horas.

Detalhes que valem saber:

- O papel de admin é reconferido contra a allowlist **em toda requisição** —
  tirar alguém da lista invalida a sessão dela na hora.
- O link mágico é consumido por `POST` a partir de `/indicacao/entrar/`, e não
  por `GET` direto na API: antivírus corporativos e clientes de e-mail abrem os
  links das mensagens para inspecionar, e isso queimaria o token antes do clique.
- Endpoints que mudam estado exigem mesma origem (proteção de CSRF, além do
  `SameSite`).
- Emissão de link limitada a 5 por e-mail e 20 por IP por hora.
- `/indicacao/pm3/` e `/indicacao/minha-pagina/` são protegidas por middleware:
  sem sessão a URL não entrega a página, mesmo para quem conhece o endereço.
- As páginas da plataforma são `noindex` e `/indicacao/` está bloqueado no
  `robots.txt`.
### Aceite do Regulamento

A tela de acesso tem a caixa **"Declaro que li e concordo com o Regulamento do
Programa de Indicação"**, sempre desmarcada ao abrir. O botão **Acessar minha
página** só habilita com ela marcada, e o link do texto abre o PDF de
`assets/docs/` em nova aba.

O servidor recusa o pedido de link sem o aceite (`aceite_obrigatorio`) e, ao
emitir o link, grava uma linha na tabela `aceites_regulamento` com o e-mail, a
data/hora (UTC), a versão vigente (`REGULAMENTO_VERSAO`, em
`functions/_lib/config.js`), o caminho do PDF, o IP e o user-agent. É um
registro só de inclusão — a prova de consentimento. Para consultar:

```bash
npx wrangler d1 execute pcamp-indicacao --remote \
  --command "SELECT email, versao, aceito_em FROM aceites_regulamento ORDER BY id DESC LIMIT 50"
```

Para publicar um regulamento novo: suba o PDF em `assets/docs/`, troque o
`href` do link em `indicacao/index.html` e atualize `REGULAMENTO_VERSAO` e
`REGULAMENTO_URL`. Os aceites antigos continuam apontando para a versão que
cada pessoa leu.

Detalhes que valem saber:

- Nenhum segredo fica no código: o token de leitura do Worker de vendas, o do
  callback e o do n8n vivem nos secrets do Pages; a chave do Google só existe
  no Worker. O navegador nunca fala com o Google nem com o Worker.
- Arquivos internos do repositório (`tests/`, `indicacao/schema*.sql`,
  `indicacao/LEIA-ME.md`) respondem 404 em produção, por Functions listadas no
  `_routes.json` — o Pages serviria qualquer arquivo do repo como estático.

---

## Desenvolvimento local

```bash
# 1. Segredos locais (não vai para o repo, está no .gitignore)
cat > .dev.vars <<'EOF'
SESSION_SECRET=um-segredo-local-de-32-caracteres-ou-mais
MAIL_PROVIDER=console
MOSTRAR_LINK=1
N8N_VIP_WEBHOOK_URL=http://127.0.0.1:8799/vip
VENDAS_API_URL=http://127.0.0.1:8798        # Worker de vendas falso que o e2e sobe
VENDAS_API_TOKEN=token-vendas-local
SYNC_CALLBACK_TOKEN=token-callback-local
EOF

# 2. Cria as tabelas no D1 local
npx wrangler d1 execute DB --local --config tests/wrangler.e2e.toml \
  --persist-to .wrangler/state --file=indicacao/schema.sql

# 3. Sobe o site + as Functions apontando para o mesmo banco
npx wrangler pages dev . --d1 DB=local-e2e --persist-to .wrangler/state \
  --compatibility-date=2026-06-23 --ip 127.0.0.1 --port 8788

# 4. Alimenta o D1 local: rode o e2e (ele sobe o Worker falso com a fixture e
#    sincroniza), ou aponte VENDAS_API_URL para um pm3-eventos-vendas-sync
#    rodando localmente (`npm run dev` lá, com o READ_TOKEN dele) e clique
#    "Atualizar dados" no painel.
node tests/e2e.mjs
```

O `d1 execute --local` não aceita o banco só por flag: precisa de um arquivo de
configuração. Ele fica em `tests/wrangler.e2e.toml`, e não num `wrangler.toml`
na raiz, pelo motivo explicado acima. O `--persist-to` e o `DB=local-e2e` fazem
os comandos enxergarem o mesmo banco.
O `--compatibility-date` é o de produção (`2026-06-23`); um Wrangler antigo em
cache pode recusar a data — nesse caso, `npx wrangler@latest`.

Com `MAIL_PROVIDER=console` nenhum e-mail é enviado: o link mágico é impresso
no terminal e, com `MOSTRAR_LINK=1`, aparece também na própria tela de acesso.
**Nunca** ligue `MOSTRAR_LINK` em produção.

### Testes

**Unitários** — sem dependências, rodam em qualquer lugar:

```bash
node tests/run.mjs
```

Cobrem a leitura da planilha (colunas, evento, cancelado, cupom que é e-mail),
quem é indicador (Passaporte × VIP × cortesia), a contagem por ingressos, a
data de qualificação, a fila dos 50, o ranking, a conversão de `pedidos` em
planilha, a gravação do snapshot (nunca toca em `vip_liberado`), o corpo do
webhook e o controle de acesso.

**Ponta a ponta** — precisa do `wrangler pages dev` rodando (instruções no topo
de `tests/e2e.mjs`):

```bash
node tests/e2e.mjs
```

Sobe um Worker de vendas falso servindo a fixture, sincroniza pela API (botão
e callback), confere o painel, sincroniza de novo para provar idempotência,
libera VIP (com um n8n falso local que confere o JSON), prova que a
sincronização preserva a marcação, simula cancelamento e cortesia, faz login
por link mágico e testa o isolamento entre os perfis. Rode antes de qualquer
PR que toque em `functions/`.

---

## Fora de escopo

- Nenhuma integração direta com a API da Sympla — a planilha é a fonte.
- A plataforma não emite nem troca o ingresso na Sympla. Liberar o VIP aqui é
  o **registro da decisão** (e o aviso ao n8n); a troca do ingresso é feita à
  parte pelo time.

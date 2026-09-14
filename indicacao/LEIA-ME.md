# Plataforma de Indicação — Product Camp 2026

Programa de indicação (member-get-member) do evento. Quem já comprou ingresso
indica amigos; quando **3 indicações viram compra paga**, a pessoa qualifica
para o upgrade gratuito de Passaporte para VIP. O prêmio vale para os **50
primeiros** que baterem a marca, e a liberação é **manual**, feita pelo time PM3.

A plataforma **não conversa com a API da Sympla**. A fonte de verdade das
compras é o relatório de participantes exportado da Sympla, que o time sobe
aqui. A cada upload a plataforma reconcilia e recalcula tudo.

---

## Como está montado

Roda no mesmo projeto do Cloudflare Pages do site, sem build:

| Onde | O quê |
| --- | --- |
| `indicacao/` | As telas (HTML/CSS/JS estáticos, sem framework) |
| `indicacao/app.css` | Tokens e componentes — os mesmos do design system do site |
| `functions/api/` | A API (Cloudflare Pages Functions) |
| `functions/_lib/` | Regras de negócio, leitura de planilha, sessão, e-mail |
| `functions/indicacao/*/[_middleware.js]` | Portões de acesso das páginas logadas |
| `indicacao/schema.sql` | Schema do banco (Cloudflare D1) |
| `tests/` | Testes: `run.mjs` (unitários, sem dependências) e `e2e.mjs` (contra o servidor local) |

Rotas:

| Rota | Quem acessa |
| --- | --- |
| `/indicacao/` | Qualquer pessoa — tela de acesso |
| `/indicacao/entrar/?t=…` | Destino do link mágico, troca o token por sessão |
| `/indicacao/minha-pagina/` | Indicador logado |
| `/indicacao/pm3/` | Só os três e-mails do time PM3 |

O site do evento (`/`, `/pocket`, `/para-empresas/`, `/lives-pre-pcamp26/`)
continua 100% estático: nenhuma Function intercepta essas rotas, então o
tempo de carregamento da landing page não muda.

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

## Setup no Cloudflare (uma vez)

> **Estado em produção (14/09/2026):** tudo abaixo já está configurado —
> banco `pcamp-indicacao` com o schema aplicado, binding `DB`, as variáveis e os
> dois secrets, só no ambiente Production. Esta seção serve para recriar o
> ambiente ou conferir o que existe.

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

### 1. Criar o banco D1

```bash
npx wrangler d1 create pcamp-indicacao
npx wrangler d1 execute pcamp-indicacao --remote --file=indicacao/schema.sql
```

O `schema.sql` é idempotente — pode rodar de novo sem perder dados.

### 2. Ligar o banco ao projeto do Pages

No painel da Cloudflare, no projeto do Pages do site:

**Settings → Bindings → Add → D1 database**

- Variable name: `DB`  ← o nome tem que ser exatamente esse
- D1 database: `pcamp-indicacao`

Faça isso **só em Production**. O Preview (o site temporário que a Cloudflare
sobe para cada PR) fica **sem banco, de propósito**: ligado ao mesmo banco,
qualquer teste feito numa preview — subir planilha, liberar VIP — iria direto
para os dados reais. Se um dia for preciso testar a plataforma em preview, crie
um banco separado (`pcamp-indicacao-preview`) em vez de reaproveitar este.

> Não existe `wrangler.toml` neste repositório de propósito: a configuração de
> hospedagem vive no painel da Cloudflare (ver `CLAUDE.md`). Adicionar um
> `wrangler.toml` na raiz faria o Pages passar a ler a configuração do arquivo
> e ignorar o que está no painel, o que pode quebrar o deploy do site.

### 3. Variáveis de ambiente

**Settings → Variables and Secrets**, em Production:

| Variável | Tipo | Valor |
| --- | --- | --- |
| `SESSION_SECRET` | Secret | String aleatória de 32+ caracteres. Trocar invalida todas as sessões abertas. |
| `MAIL_PROVIDER` | Texto | `resend` ou `sendgrid` |
| `MAIL_FROM` | Texto | `Product Camp 2026 <eventos@pm3.com.br>` |
| `RESEND_API_KEY` | Secret | Se `MAIL_PROVIDER=resend` |
| `SENDGRID_API_KEY` | Secret | Se `MAIL_PROVIDER=sendgrid` |

Para gerar o segredo:

```bash
openssl rand -base64 32
```

O domínio do remetente precisa estar verificado no provedor de e-mail, senão
os links mágicos caem em spam ou nem saem. Hoje o remetente é o **`pm3.com.br`**,
que é o domínio verificado na conta da PM3 no Resend — o `productcamp.com.br`
não está configurado lá. A `RESEND_API_KEY` precisa ser **dessa mesma conta**.

Duas regras que decorrem disso:

- **O `MAIL_FROM` tem que terminar exatamente em `@pm3.com.br`.** O DMARC do
  domínio é estrito (`adkim=s`, `p=quarantine`): um remetente em subdomínio,
  como `@mail.pm3.com.br`, vai para a quarentena.
- **Atenção ao limite diário do plano do Resend.** Cada pedido de acesso é um
  e-mail. Um convite em massa para o programa pode gerar mais pedidos num dia
  do que o plano permite, e aí o login para até o limite renovar. Confira o
  plano antes de divulgar.

### 4. Carregar a lista de indicadores

Entre em `/indicacao/pm3/` com um dos e-mails do time → **Importar planilha** →
aba **Lista de indicadores (cupons)**.

Aceita dois formatos:

- **Lista de cupons pronta** (recomendado), CSV ou XLSX com as colunas
  `E-mail`, `Código público`, `Primeiro nome` e, opcionalmente, `Ativo`.
  Exemplo em `tests/fixtures/lista-indicadores.csv`.
- **O próprio export da Sympla**: a plataforma deriva a lista dali — só compras
  aprovadas, quem já tem ingresso VIP fica fora, e quando o mesmo e-mail tem
  vários `Nº ingresso` o primeiro é fixado como código público.

Sem indicadores cadastrados, todo cupom da planilha aparece como "cupom sem
indicador" e ninguém pontua.

---

## Operação do dia a dia

1. Exportar o relatório de participantes na Sympla (CSV ou XLSX, sem renomear
   colunas).
2. `/indicacao/pm3/` → **Importar planilha** → soltar o arquivo.
3. Ler o resumo de conciliação. Nada foi gravado ainda.
4. **Confirmar e atualizar painel**.
5. Liberar os upgrades VIP na coluna **VIP liberado** de quem qualificou.

O upload é sempre uma **foto completa da base**: sobe-se o relatório inteiro,
não só o que mudou. A plataforma casa as compras pelo `Nº ingresso`, então
subir o mesmo arquivo duas vezes atualiza em vez de duplicar.

### O que o resumo de conciliação mostra

| Número | Significado |
| --- | --- |
| compras lidas na planilha | Linhas com `Nº ingresso` válido |
| novas desde o último import | `Nº ingresso` que ainda não estava no banco |
| indicadores qualificaram agora | Bateram as 3 compras neste import |
| marcações de VIP alteradas | **Tem que ser sempre 0.** Conferido comparando o estado antes e depois de gravar |
| com pagamento aprovado | Só essas contam |
| aprovadas que saíram da planilha | Estavam aprovadas e não vieram nesta foto (reembolso/cancelamento). Deixam de contar |
| linhas com cupom sem indicador | Cupom que não casa com ninguém da lista — revisar com a organização |
| compras do próprio indicador | Ninguém pontua indicando a si mesmo |

Se "aprovadas que saíram da planilha" vier com um número alto e inesperado, o
arquivo provavelmente estava incompleto: suba o relatório inteiro de novo.

### Colunas que a plataforma lê

| Campo | Coluna da Sympla |
| --- | --- |
| Cupom do indicador | `Cupom de Desconto` (e-mail puro) |
| Chave única da compra | `Nº ingresso` |
| Nome do comprador | `Nome` + `Sobrenome` |
| E-mail do comprador | `Email` |
| Número do pedido | `Nº pedido` |
| Tipo de ingresso | `Tipo de ingresso` |
| Valor | `Valor` |
| Estado de pagamento | `Estado de pagamento` (conta apenas `Aprovado`) |
| Data | `Data compra` |

Obrigatórias: `Nº ingresso`, `Cupom de Desconto` e `Estado de pagamento`. Sem
elas o import é recusado com a mensagem dizendo qual falta. Cabeçalhos são
comparados sem acento e sem diferenciar maiúsculas, e alguns nomes alternativos
são aceitos (ver `functions/_lib/planilha.js`).

---

## Regras implementadas

1. O cupom de cada indicador **é o e-mail dele**, puro, sem prefixo.
2. Os 10% de desconto ficam configurados no cupom, na Sympla. A plataforma só
   usa o e-mail do cupom para atribuir a compra.
3. Só conta indicação que **virou compra paga**.
4. Só conta compra com `Estado de pagamento` = `Aprovado`.
5. O upgrade é desbloqueado a partir de **3 compras confirmadas**.
6. `qualificou_em` é gravado na **primeira** vez que a pessoa bate a meta e
   nunca é reescrito — é ele que define a ordem da fila dos 50.
7. A liberação do VIP é **manual**. Bater 3 compras qualifica; quem libera é o
   time, no painel. O indicador vê só o resultado.
8. Quem já tem ingresso VIP não entra na lista de indicadores.
9. "Só indicar quem ainda não comprou" é uma regra **comunicada** nas telas,
   não bloqueada pela plataforma (o desconto é aplicado na Sympla).
10. O ranking mostra **só primeiro nome e código público**. Nunca e-mail.
11. O indicador vê apenas as próprias indicações, o próprio progresso e a
    própria posição.

A compra do próprio indicador (mesmo e-mail no comprador e no cupom) não conta
para ele.

---

## Acesso

Dois perfis, decididos pelo e-mail:

- **Time PM3 (admin)** — allowlist fixa no código, em
  `functions/_lib/config.js`: `eventos@pm3.com.br`. Mudar essa lista é
  mudar código, revisado por PR.
- **Indicador** — qualquer e-mail ativo na tabela `indicadores`.

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

---

## Desenvolvimento local

```bash
# 1. Segredos locais (não vai para o repo, está no .gitignore)
cat > .dev.vars <<'EOF'
SESSION_SECRET=um-segredo-local-de-32-caracteres-ou-mais
MAIL_PROVIDER=console
MOSTRAR_LINK=1
EOF

# 2. Cria as tabelas no D1 local
npx wrangler d1 execute DB --local --config tests/wrangler.e2e.toml \
  --persist-to .wrangler/state --file=indicacao/schema.sql

# 3. Sobe o site + as Functions apontando para o mesmo banco
npx wrangler pages dev . --d1 DB=local-e2e --persist-to .wrangler/state \
  --compatibility-date=2026-06-23 --ip 127.0.0.1 --port 8788
```

O `d1 execute --local` não aceita o banco só por flag: precisa de um arquivo de
configuração. Ele fica em `tests/wrangler.e2e.toml`, e não num `wrangler.toml`
na raiz, pelo motivo explicado acima. O `--persist-to` e o `DB=local-e2e` fazem
os dois comandos enxergarem o mesmo banco — sem eles, o servidor sobe com um D1
vazio e as tabelas criadas no passo 2 ficam num banco que ninguém lê.

O `--compatibility-date` é o mesmo do projeto em produção (`2026-06-23`), para
o teste validar o runtime real. Se ele mudar no painel, mude aqui, no
`tests/wrangler.e2e.toml` e no topo do `tests/e2e.mjs`. Um Wrangler antigo em
cache não sobe com essa data (erro *"newest date supported … is"*): nesse caso,
rode com `npx wrangler@latest`.

Com `MAIL_PROVIDER=console` nenhum e-mail é enviado: o link mágico é impresso
no terminal e, com `MOSTRAR_LINK=1`, aparece também na própria tela de acesso.
**Nunca** ligue `MOSTRAR_LINK` em produção — ela entregaria o link de acesso a
quem apenas digitou o e-mail.

### Testes

**Unitários** — sem dependências, rodam em qualquer lugar:

```bash
node tests/run.mjs
```

Cobrem o que é regra de negócio e o que é fácil de quebrar sem perceber:
leitura de CSV e XLSX, mapeamento das colunas da Sympla, as regras de contagem,
a fila dos 50, o ranking e o controle de acesso (sessão assinada, cookie
forjado, sessão expirada, allowlist de admin).

**Ponta a ponta** — precisa do `wrangler pages dev` rodando (as instruções
estão no topo do arquivo):

```bash
node tests/e2e.mjs
```

Sobe planilha, confere a conciliação, reimporta para provar idempotência,
libera VIP, faz login por link mágico e testa o isolamento entre os perfis.
Rode antes de qualquer PR que toque em `functions/`.

---

## Fora de escopo

- Nenhuma integração direta com a API da Sympla.
- A plataforma não emite nem troca o ingresso na Sympla. Liberar o VIP aqui é
  o **registro da decisão**; a troca do ingresso é feita à parte pelo time.

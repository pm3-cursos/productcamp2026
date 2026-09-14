# CLAUDE.md — Orientações para LLM (Product Camp 2026)

Guia para qualquer assistente de IA que trabalhe neste repositório. Leia antes de editar.

## O que é este projeto

Landing page do **Product Camp Brasil 2026** — o maior evento de produto da América Latina (08 e 09 de dezembro de 2026, São Paulo, SP) — e a **plataforma de indicação** do evento, em `/indicacao/`.

- **Site estático**, sem build, sem framework. O site em si não tem backend; a única parte com servidor é a plataforma de indicação (ver a seção própria abaixo).
- Todo o conteúdo do site vive em **`index.html`** (página única). CSS em blocos `<style>` internos.
- **Estrutura de arquivos:**
  - `assets/fonts/` — fontes Inter Tight (WOFF2, subset Latin ~1025 glifos para performance). Backup das fontes completas em `assets/fonts/_full/` — restaurar de lá se precisar de algum glifo fora do Latin. Ao adicionar conteúdo com caracteres especiais incomuns, verifique se o subset os cobre.
  - `assets/img/` — imagens, organizadas em subpastas: `bg/`, `speakers/`, `coordinators/`, `venue/`, `sponsors/`, `brand/`. `og-image.png` fica em `assets/img/`. `assets/img/legacy/` guarda imagens órfãs (não referenciadas) arquivadas.
  - `assets/docs/` — documentos públicos servidos pelo site (hoje, o PDF do Regulamento do Programa de Indicação, linkado na tela de acesso de `/indicacao/`).
  - `indicacao/` — telas da plataforma de indicação (HTML/CSS/JS estáticos) + `schema.sql` + `LEIA-ME.md`.
  - `functions/` — a API da plataforma de indicação (Cloudflare Pages Functions). **Nenhuma rota do site passa por aqui.**
  - `tests/` — testes da plataforma de indicação: `run.mjs` (unitários, sem dependências) e `e2e.mjs` (contra o servidor local).
  - **Raiz:** `index.html`, favicons (`favicon.png`, `favicon-16.png`, `apple-touch-icon.png` — ficam na raiz por convenção), `robots.txt`, `sitemap.xml`, `llms.txt`, `.gitignore`, `CLAUDE.md`, `README.md`.
  - Ao adicionar uma imagem nova, coloque-a na subpasta correta de `assets/img/` (nunca na raiz) e referencie com o caminho relativo completo.
- **Hospedagem:** Cloudflare Pages, conectado ao Git. **Todo push na `main` republica o site automaticamente.**
- **Domínio:** `https://www.productcamp.com.br` (apex `productcamp.com.br` redireciona 301 → www).
- **Repositório:** `pm3-cursos/productcamp2026` (fork). `upstream` = `jaquelinesantospm3/productcamp2026`.

## Princípios inegociáveis

1. **Performance é prioridade.** Sempre otimizar o tempo de carregamento — mas sem desrespeitar o que o prompt pede. As duas coisas convivem; quando conflitarem, ver item 2.
2. **Questione prompts que levem a carregamento lento.** Se uma instrução tende a inflar o tempo de load (libs pesadas, imagens não otimizadas, fontes extras, scripts bloqueantes), **avise antes de executar** e proponha a alternativa mais leve.
3. **Boas práticas de HTML e CSS, com foco em SEO.** HTML semântico, headings em hierarquia correta, `alt` em imagens, meta tags válidas, dados estruturados quando fizer sentido.
4. **Sem estilos inline.** Evitar `style=` no HTML. Manter o CSS limpo, organizado e centralizado. (Hoje existem ~28 inline styles legados — reduzir progressivamente quando tocar nas seções correspondentes, sem refactor de big-bang não solicitado.)
5. **SEO não pode quebrar a marca.** Otimização nunca compromete o layout aprovado, o design system nem o key visual do evento. As duas coisas têm que coexistir.

## Mobile-first

O site é pensado **primeiro para mobile** — a maioria do tráfego de evento vem do celular.

- Interface simples; informações principais (data, local, programação, palestrantes, inscrição) visíveis e fáceis de achar.
- Boa leitura em telas pequenas; CTAs grandes e fáceis de tocar.
- Navegação clara. Testar layout no viewport estreito antes de considerar pronto.

## Performance — checklist prático

- **Core Web Vitals são a métrica de referência.** Monitorar:
  - **LCP** (carregamento do conteúdo principal) — manter a imagem/hero da dobra leve e priorizada.
  - **CLS** (estabilidade visual) — `width`/`height` explícitos em imagens; evitar conteúdo que "pula".
  - **INP** (resposta à interação) — não bloquear a thread com JS pesado.
- **Imagens:** preferir `.webp`/`.avif` (já é o padrão do repo). Dimensionar para o uso real; `loading="lazy"` abaixo da dobra (já aplicado em boa parte do site).
- **Vídeo:** evitar autoplay de vídeo pesado. Sem autoplay hoje — manter assim.
- **Animações:** evitar animações pesadas/custosas que travem a rolagem.
- **Fontes:** Inter Tight local (`fonts/`). Não adicionar pesos/fontes novas sem necessidade real. Usar `font-display: swap`.
- **CSS/JS:** nada de bibliotecas pesadas para efeitos que CSS resolve. Sem render-blocking desnecessário. Reduzir scripts dispensáveis. Minificar só se não atrapalhar a manutenção.
- **Terceiros:** scripts de tracking/marketing (pixels, analytics) devem ser `async`/`defer` e carregados após o conteúdo principal.

## SEO — checklist prático

- **Headings:** um único `<h1>` por página; `<h2>`/`<h3>` em hierarquia lógica.
- **HTML semântico:** `<header>`, `<main>`, `<section>`, `<footer>`, `<nav>`. Conteúdo deve ser indexável como texto — **não depender só de imagens** para informação importante.
- **Meta tags por página:**
  - `title` claro e específico (ex: "Product Camp 2026 | Conferência de Produto em São Paulo").
  - `meta description` objetiva e coerente com o conteúdo.
  - **Open Graph** e **Twitter/X Card** completos, com URL absoluta válida.
  - **`canonical`** quando necessário. ⚠️ **Pendência:** hoje o site não tem `<link rel="canonical">` — adicionar apontando para a URL canônica (`https://www.productcamp.com.br/`).
  - ⚠️ **Pendência:** `og:image` ainda aponta para `framerusercontent.com` (resíduo de export do Framer). Trocar por imagem hospedada no próprio domínio/Pages.
- **Alt text:** descritivo, refletindo o conteúdo real da imagem; sem keyword stuffing; nunca genérico ("imagem", "foto"). `alt=""` em imagens puramente decorativas.
- **Favicon:** já configurado (`favicon.png` 32x32, `favicon-16.png`, `apple-touch-icon.png`). Manter; só atualizar se a marca mudar.
- **Dados estruturados (`Event`):** ⚠️ **Pendência — não existe schema no site.** Adicionar JSON-LD `schema.org/Event` para o evento aparecer melhor na busca. Incluir: nome, descrição, `startDate`/`endDate` (08–09/12/2026, fuso `-03:00`), local e endereço (São Paulo, SP), imagem, organizador (PM3 — `https://www.cursospm3.com.br`), URL oficial, `eventStatus`, `eventAttendanceMode` (presencial) e ofertas/ingressos quando aplicável.

  ```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Product Camp 2026",
    "startDate": "2026-12-08T09:00:00-03:00",
    "endDate": "2026-12-09T18:00:00-03:00",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": { "@type": "Place", "name": "São Paulo",
      "address": { "@type": "PostalAddress", "addressLocality": "São Paulo", "addressRegion": "SP", "addressCountry": "BR" } },
    "organizer": { "@type": "Organization", "name": "PM3", "url": "https://www.cursospm3.com.br" },
    "url": "https://www.productcamp.com.br/"
  }
  </script>
  ```

- **URLs amigáveis** *(condicional — só quando o site deixar de ser página única)*: usar caminhos simples e descritivos (`/agenda`, `/palestrantes`, `/ingressos`, `/local`). Evitar URLs longas, parâmetros/IDs sem contexto e mistura de idiomas. Hoje o site é single-page, então não se aplica ainda.

## CSS — organização

- Centralizar regras nos blocos `<style>` (ou, se o arquivo crescer, considerar extrair para `styles.css` externo — propor antes).
- **Não** introduzir novos `style=` inline. Ao editar uma seção que já tem inline, migrar aquele trecho para classe/regra.
- Nomes de classe claros e consistentes com o que já existe.

## Marca, layout e design system

- Respeitar o **layout aprovado** e o **key visual** do evento; manter consistência visual entre seções.
- Seguir o **design system da PM3** (ver skill `pm3-design-system` quando disponível).
- Hierarquia de informação clara: o usuário acha rápido data, local, programação, palestrantes e inscrição.
- Equilíbrio é a regra: **SEO + performance + clareza de informação + força visual da marca**, sem sacrificar nenhum dos quatro.

## Fluxo de trabalho

- **Sempre criar branch** para qualquer mudança — nunca commitar direto na `main`.
  **Exceção:** o dono do repositório pode pedir commit direto na `main` ou merge com
  bypass de admin. Nesse caso, execute sem questionar o fluxo — a regra existe para os
  demais colaboradores. O cuidado com o item abaixo (publicar em produção) continua valendo.
- **Commit só quando o usuário pedir** explicitamente.
- Lembrar: como o Pages publica a `main` automaticamente, **mergear na `main` = publicar em produção**. Tratar merges com esse cuidado.

## Trabalhar de forma saudável com o GitHub

Regras para evitar quebrar produção (já aconteceu: uma edição feita sobre uma base
desatualizada reintroduziu caminhos de arquivos que tinham sido movidos, quebrando o
hero e o logo em produção).

**1. Sempre parta de uma `main` sincronizada.**
   - Antes de criar uma branch nova, atualize a `main` local:
     ```
     git checkout main && git fetch origin && git pull --ff-only origin main
     ```
   - Nunca comece a trabalhar em cima de uma `main` local defasada. O `index.html` é um
     arquivo único e grande — editar uma versão antiga sobrescreve o trabalho de outros.

**2. Sincronize a branch com a `main` ANTES de abrir/mergear o PR.**
   - Ok manter uma branch dessincronizada de propósito por um tempo (trabalho longo,
     experimento). Mas antes do PR, traga a `main` para dentro dela e resolva conflitos:
     ```
     git fetch origin && git merge origin/main   # (ou rebase, se preferir histórico linear)
     ```
   - Depois valide que nada quebrou (ver regra 4) — especialmente **caminhos de assets**,
     que são a causa mais comum de regressão aqui.

**3. Nunca edite `index.html` pela interface web do GitHub.**
   - A edição web parte de uma base que pode estar desatualizada e não há validação.
   - A `main` está protegida (PR + 1 aprovação obrigatórios; push direto e force-push
     bloqueados para não-admins). Admins conseguem bypass, mas **evitem** — o objetivo da
     proteção é justamente forçar o fluxo de PR.

**4. Antes de mergear, valide as referências de assets.**
   - Confirme que todo `src`/`href`/`url()` do `index.html` aponta para um arquivo que
     existe (fontes em `assets/fonts/`, imagens em `assets/img/...`). Um caminho errado
     não dá erro de build — só quebra silenciosamente em produção.

**5. Um PR = uma mudança coerente.** Facilita revisão e reverter se algo quebrar.

## Plataforma de indicação (`/indicacao/`)

Programa de indicação (member-get-member) do evento, no mesmo projeto do Pages.
Documentação completa — setup no Cloudflare, operação, regras e testes — em
**`indicacao/LEIA-ME.md`**. Leia esse arquivo antes de mexer em qualquer coisa
dentro de `indicacao/`, `functions/` ou `tests/`.

O que não pode ser esquecido ao tocar nessa parte:

- **Não crie `wrangler.toml` na raiz.** O Pages passaria a ler a configuração
  do arquivo e a ignorar o painel da Cloudflare, o que pode quebrar o deploy do
  site. Bindings e variáveis ficam no painel; para rodar local, use as flags do
  `wrangler pages dev` e o `.dev.vars`.
- **Nenhuma Function na raiz.** `functions/` só tem arquivos dentro de `api/` e
  de `indicacao/`. Um `functions/_middleware.js` na raiz passaria a interceptar
  **todas** as requisições, inclusive as da landing page, e cobraria latência de
  uma página que hoje é 100% estática.
- **A allowlist de admin é código**, em `functions/_lib/config.js`. Mudar quem é
  admin é mudar código, revisado por PR — não existe tela para isso.
- **Import de planilha nunca altera marcação manual de VIP.** O resumo de
  conciliação prova isso comparando o estado antes e depois de gravar; o número
  "marcações de VIP alteradas" tem que ser sempre 0.
- **Regra de negócio mora em `functions/_lib/reconciliacao.js`**, em JavaScript
  puro e coberta por teste. Não duplique essas regras em SQL — o dia em que as
  duas implementações discordarem, alguém perde um prêmio.
- **O visual é o design system do site, não um à parte.** `indicacao/app.css`
  abre com o mesmo bloco `:root` de `index.html`, copiado valor a valor, e
  reaproveita os componentes das páginas atuais (`nav`, `footer`,
  `.btn-primary`, `.btn-secondary`, `.section-label`, `.container`, cards em
  `--navy-card`). As fontes são as mesmas do site — `InterTight` 400 e 600, de
  `assets/fonts/` — e não há nenhuma fonte exclusiva da plataforma. Ao mexer
  nos tokens do site, atualize esse bloco junto; a única cor fora do design
  system é o verde do WhatsApp, e está comentada no arquivo.
- Rode `node tests/run.mjs` antes de abrir PR.

## Não mexer

- Registros DNS de e-mail/marketing (HubSpot, SendGrid/RD Station, Google, Sympla, Circle) — não têm relação com o site.
- Configuração de hospedagem é no painel da Cloudflare, não no repo.

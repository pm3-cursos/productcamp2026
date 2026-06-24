# CLAUDE.md — Orientações para LLM (Product Camp 2026)

Guia para qualquer assistente de IA que trabalhe neste repositório. Leia antes de editar.

## O que é este projeto

Landing page do **Product Camp Brasil 2026** — o maior evento de produto da América Latina (08 e 09 de dezembro de 2026, São Paulo, SP).

- **Site estático**, sem build, sem framework, sem backend.
- Todo o conteúdo vive em **`index.html`** (página única). CSS em blocos `<style>` internos.
- **Estrutura de arquivos:**
  - `assets/fonts/` — fontes Inter Tight (WOFF2, subset Latin ~1025 glifos para performance). Backup das fontes completas em `assets/fonts/_full/` — restaurar de lá se precisar de algum glifo fora do Latin. Ao adicionar conteúdo com caracteres especiais incomuns, verifique se o subset os cobre.
  - `assets/img/` — imagens, organizadas em subpastas: `bg/`, `speakers/`, `coordinators/`, `venue/`, `sponsors/`, `brand/`. `og-image.png` fica em `assets/img/`. `assets/img/legacy/` guarda imagens órfãs (não referenciadas) arquivadas.
  - **Raiz:** `index.html`, favicons (`favicon.png`, `favicon-16.png`, `apple-touch-icon.png` — ficam na raiz por convenção), `robots.txt`, `sitemap.xml`, `llms.txt`, `CLAUDE.md`, `README.md`.
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
- **Commit só quando o usuário pedir** explicitamente.
- Lembrar: como o Pages publica a `main` automaticamente, **mergear na `main` = publicar em produção**. Tratar merges com esse cuidado.

## Não mexer

- Registros DNS de e-mail/marketing (HubSpot, SendGrid/RD Station, Google, Sympla, Circle) — não têm relação com o site.
- Configuração de hospedagem é no painel da Cloudflare, não no repo.

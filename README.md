# Product Camp 2026 — Site Oficial

Site oficial do Product Camp Brasil 2026, o maior evento de produtos digitais da América Latina. Desenvolvido inteiramente em HTML, CSS e JavaScript puros — sem frameworks, sem dependências externas.

**URL:** jaquelinesantospm3.github.io/productcamp2026  
**Evento:** 08 e 09 de dezembro de 2026 — Centro de Convenções Frei Caneca, São Paulo, SP

---

## 📁 Estrutura de arquivos

```
productcamp2026/
│
├── index.html                  # Site completo (HTML + CSS + JS em um único arquivo)
│
├── logo_escuro.svg             # Logo PCamp — versão fundo escuro
├── logo_claro.svg              # Logo PCamp — versão fundo claro
├── favicon.png                 # Favicon 32x32
│
├── hero-bg.webp                # Imagem hero
├── about-bg.webp               # Imagem seção About
├── tickets-stage.webp          # Imagem ingressos
├── venue-networking.webp       # Foto local
├── venue-selfie.webp           # Foto local
│
├── trilha-pm.webp              # Trilha Product Management
├── trilha-ai.webp              # Trilha Building & Automation
├── trilha-lideranca.webp       # Trilha Liderança & Negócios
├── trilha-marketing.webp       # Trilha Marketing & Design
│
├── sp-marty.webp               # Palestrante Marty Cagan
├── sp-diego.webp               # Palestrante Diego Barreto
├── ... (outros palestrantes)
│
├── priscila_lugao.jpg          # 👤 Coordenadora Geral
├── eduardo_borges.jpg          # 👤 Coordenador Trilha PM
├── ingrid_coutinho.jpg         # 👤 Coordenadora Trilha PM
├── gabriel_werlich.jpg         # 👤 Coordenador Trilha Building
├── talita_paoletti.jpg         # 👤 Coordenadora Trilha Building
├── mariana_tosi.jpg            # 👤 Coordenadora Trilha Marketing
├── alex_soares.jpg             # 👤 Coordenador Trilha Marketing
├── rafael_justino.jpg          # 👤 Coordenador Trilha Liderança
├── fernanda_faria.jpg          # 👤 Coordenadora Trilha Liderança
│
├── minders.svg                 # Logo patrocinador
├── mixpanel_.svg               # Logo patrocinador
├── clevertap.avif              # Logo patrocinador
│
└── fonts/
    ├── INTERTIGHT-LIGHT.TTF
    ├── INTERTIGHT-REGULAR.TTF
    ├── INTERTIGHT-MEDIUM.TTF
    └── INTERTIGHT-SEMIBOLD.TTF
```

---

## 📄 Seções do site

| Seção | Descrição |
|-------|-----------|
| **Nav** | Fixo, transparente no topo. Links: FAQ, Speakers, Patrocine + CTA "Garantir ingresso" |
| **Hero** | Mote: User. Builder. Thinker. Leader. com imagem de fundo |
| **Stats** | +80 palestrantes, 6 palcos, +3.000 participantes, 2 dias — contador animado |
| **About** | 4 pilares (User/Builder/Thinker/Leader) em grid responsivo |
| **Trilhas** | 🆕 **Novo layout:** as 4 trilhas empilhadas e todas visíveis; cada uma é nome + descrição + fileira horizontal de cards |
| **Coordenação geral** | Dobra dedicada à Priscila Lugão, em layout horizontal (foto ao lado do texto) |
| **Speakers** | Grid 5 colunas — foto, empresa, nome e cargo |
| **Local** | 2 colunas: texto + mosaico de fotos |
| **Ingressos** | 2 cards (Passaporte e VIP) com preços |
| **Hotéis** | 3 cards com descontos especiais |
| **FAQ** | Acordeão com perguntas frequentes |
| **Footer** | Logo, redes, links legais |

---

## 🆕 Seção de Trilhas (Redesign 2026)

### Estrutura
A dobra tem **dois blocos**, na ordem do mockup do Claude Design:

1. **Grade de palestrantes** (`.track-speakers`) — uma grade só, sem fileira que rola para o lado.
   Cada card carrega o **nome da trilha**, então a pessoa aparece uma vez e a trilha continua
   legível sem precisar de 4 fileiras separadas.
2. **Coordenação** (`.general-coord`) — o painel da coordenação geral (`.gc-panel`) e, abaixo dele,
   as **abas das 4 trilhas** (`.track-tabs-wrap`): cada aba abre a **descrição** da trilha e os
   cards de quem **coordena**.

A grade é `auto-fill` com mínimo de 200px — não há largura fixa para manter. No container de
1160px ela fecha **5 colunas**; no tablet, 3; no celular, 2.

### Card de palestrante (`.track-card`)
Composição vinda do mockup: **empresa no topo** (rótulo apagado, acima da foto) → foto → **trilha**
(ciano) → **nome** → **cargo**.

Palestrante sem empresa: deixe a `.track-card-company` **vazia** — nunca use placeholder. O bloco
mantém a altura de uma linha (via `::after` com espaço de largura zero), então a foto fica alinhada
com a dos cards vizinhos. `min-height` não resolveria: com `box-sizing: border-box` o padding
comeria a altura mínima e o card sem empresa subiria uns 14px.

### Card "Em breve" (`.track-card--soon`)
Um por trilha, **todos no fim da grade**, cada um com o rótulo da sua trilha: sinaliza que ainda vem
gente e **em qual trilha**.

- Silhueta desenhada em **CSS puro** (`.soon-avatar`, pseudo-elementos) — zero requisição, zero KB.
- `aria-hidden="true"`: é decorativo, não entra na lista para leitor de tela.
- Aparece **só a partir de 1160px**. Abaixo disso a grade cai para 3 ou 2 colunas e os 4
  placeholders viravam duas telas de rolagem sem informação nenhuma. Escondidos, os 6 palestrantes
  fecham fileiras cheias em todo tamanho: **5×2** no desktop, **3×2** no tablet, **2×3** no celular.

> **Ao confirmar um palestrante, cole o card real ANTES dos "Em breve"** — eles ficam sempre por
> último na grade.

### Abas das trilhas (`.track-tabs-wrap`)
Padrão de tabs do ARIA, em JS puro: `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`,
`tabindex` roving e navegação por ←/→/Home/End. Os **4 painéis já vêm no HTML** — o JS só troca o
atributo `hidden`, então sem JS o primeiro painel continua visível e nada some da página.

**As 4 trilhas ficam sempre visíveis e clicáveis**, em qualquer largura:

| Largura | Forma | Colunas |
|---|---|---|
| acima de 900px | régua com sublinhado na aba ativa | 4 em linha |
| 641–900px | chips | 4 em linha |
| até 640px | chips | 2×2 |

A régua horizontal precisa de ~845px para caber as 4 trilhas — abaixo disso a última saía da tela e
ainda dava rolagem horizontal na página, por isso a troca por chips. Cada chip tem **48px de altura
mínima** (alvo de toque) e `grid-auto-rows: 1fr` iguala a altura quando um nome quebra em duas
linhas. Verificado em 360, 375, 390, 414, 430, 560, 641, 700, 768, 834, 900, 901, 1024 e 1440px.

### Coordenação das trilhas

| Trilha | Coordenador 1 | Coordenador 2 |
|--------|---------------|---------------|
| **Product Management** | Eduardo Borges — Monuv | Ingrid Coutinho — Itaú |
| **Building & Automation** | Gabriel Werlich — Conta Mais | Talita Paoletti — Grupo Boticário |
| **Marketing & Design** | Mariana Tosi — Insider One | Alex Soares — Totvs |
| **Liderança & Negócios** | Rafael Justino — Serrabits | Fernanda Faria — Nubank |

Cada dupla vive no painel da sua aba, em cards `.coord-mini` (foto 56px + rótulo rosa + nome +
`Empresa — Cargo`).

**No celular (até 640px) a foto sobe para 120×120**, o mesmo tamanho e tratamento da foto da Priscila
Lugão no `.gc-panel` — e o card empilha, igual ao painel da coordenação geral. Vale só para os cards
de coordenação: o card de palestrante segue o tamanho do mockup.

A **Coordenação Geral** (Priscila Lugão — Product Coordinator, Med Review) abre o bloco de
coordenação (`.gc-panel`), logo acima das abas.

### Recursos técnicos
- Layout responsivo por `grid auto-fill` — sem largura de card fixa para manter
- Abas em JS puro seguindo o padrão de tabs do ARIA (teclado incluído)
- `prefers-reduced-motion` respeitado
- Sem dependências externas

---

## 💻 Tecnologia

- **HTML/CSS/JS puros** — zero dependências, zero frameworks
- **Fonte:** Inter Tight (carregada localmente via @font-face)
- **Imagens:** convertidas para .webp (redução 85-99% de peso)
- **Hospedagem:** GitHub Pages (gratuito)
- **Domínio:** configurável via DNS

---

## 📝 Como atualizar o site

### Atualizar um texto
1. Abra `index.html` no VS Code
2. Use Ctrl+F para encontrar o trecho
3. Edite e salve
4. Faça upload no GitHub → site atualiza em ~1 minuto

### Adicionar palestrante ou coordenador a uma trilha
1. Suba a foto **400×400 em `.webp`** em `assets/img/speakers/` (palestrante) ou
   `assets/img/coordinators/` (coordenação)
2. Abra `index.html` e localize a seção `.tracks-section`
3. Cole o bloco na `.track-speakers`, **logo antes do primeiro card "Em breve"**
   (`.track-card--soon`) — eles fecham a grade:

```html
<article class="track-card" role="listitem">
  <span class="track-card-company">Empresa</span>
  <div class="track-card-photo">
    <img src="assets/img/speakers/sp-nome.webp" width="400" height="400"
         alt="Foto de Nome Completo, Cargo na Empresa" loading="lazy">
  </div>
  <div class="track-card-info">
    <span class="track-card-track">Nome da trilha</span>
    <div class="track-card-name">Nome Completo</div>
    <span class="track-card-role">Cargo</span>
  </div>
</article>
```

**Sem empresa confirmada:** deixe a `.track-card-company` vazia (`<span class="track-card-company"></span>`)
— a altura fica reservada e as fotos seguem alinhadas.

Para **coordenação de trilha**, o card é outro: vai dentro do `.track-panel` da trilha, nas abas
mais abaixo:

```html
<article class="coord-mini">
  <div class="coord-mini-photo">
    <img src="assets/img/coordinators/nome.webp" width="400" height="400"
         alt="Foto de Nome Completo, Cargo na Empresa" loading="lazy">
  </div>
  <div class="coord-mini-info">
    <span class="coord-mini-label">Coordenação</span>
    <div class="coord-mini-name">Nome Completo</div>
    <span class="coord-mini-role">Empresa — Cargo</span>
  </div>
</article>
```

Não é preciso mexer em altura nem em nenhum CSS — as duas grades são `auto-fill`.

### Adicionar um palestrante
1. Copie o bloco abaixo e cole dentro de `.speakers-grid`:

```html
<div class="speaker-card">
  <div class="speaker-photo-wrap">
    <span class="speaker-company">EMPRESA</span>
    <img src="speaker-nome.webp" alt="Nome Completo" loading="lazy">
  </div>
  <hr class="speaker-divider">
  <div class="speaker-info">
    <div class="speaker-name">Nome Completo</div>
    <div class="speaker-role">Cargo</div>
  </div>
</div>
```

2. Suba a foto em `.webp` na raiz do repositório

### Atualizar preço / lote de ingresso
Procure no `index.html` por `R$ 1.649` (Passaporte) ou `R$ 2.149` (VIP) e substitua pelo novo valor.

---

## 🌐 Publicação no GitHub Pages

### Primeira publicação
1. Crie repositório público no GitHub
2. Faça upload de todos os arquivos (raiz + pasta `fonts/`)
3. Vá em Settings → Pages → Branch: main → Save
4. Site fica disponível em `seuusuario.github.io/productcamp2026`

### Domínio customizado
1. Em Settings → Pages → Custom domain: insira `www.productcamp.com.br`
2. No painel de DNS do registrador, crie:

| Tipo | Nome | Valor |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | seuusuario.github.io |

### Atualizar conteúdo
1. Acesse o repositório no GitHub
2. Add file → Upload files
3. Arraste os arquivos novos
4. Commit changes — site atualiza em ~1 minuto

---

## 🎨 Branding

| Elemento | Valor |
|----------|-------|
| Cor primária (navy) | #2B1E39 |
| Rosa / pink | #DF0C78 |
| Ciano | #18CEF4 |
| Branco | #FFFFFF |
| Fonte | Inter Tight (Light, Regular, Medium, SemiBold) |

---

## 📞 Suporte

- **Dúvidas sobre atualizar trilhas?** Veja seção "Adicionar/Atualizar coordenador de trilha"
- **Erro nas imagens?** Verifique se estão na raiz do repositório com nome exato
- **Teste local antes de fazer push** — abra o arquivo em navegador (F5 para refresh)

---

## 📌 Versão

- **Última atualização:** Junho 2026
- **Versão:** 2.0 (Seção de Trilhas com Coordenadores)
- **Desenvolvido com:** Claude (Anthropic)
- **Realização:** PM3

---

**Pronto para produção! 🚀**

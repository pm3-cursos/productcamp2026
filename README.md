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
As **4 trilhas ficam todas visíveis**, empilhadas na página. **Não** existe container de altura fixa
nem barra de rolagem vertical interna — ninguém precisa rolar uma barra para achar as outras trilhas.

Cada trilha (`.track-lane`) tem 3 níveis empilhados:
1. **Nome** (`.track-lane-title`) — com a barra rosa de destaque à esquerda;
2. **Descrição** (`.track-lane-desc`) — logo abaixo do nome, alinhada pelo mesmo eixo;
3. **Fileira de cards** (`.track-row`) — coordenadores da trilha primeiro, palestrantes depois.

Só a **fileira** rola, e na horizontal: **palestrante novo entra pelo lado, sem esticar a altura.**

- **Desktop:** setas clicáveis nas pontas da fileira. Só aparecem quando há overflow e somem ao
  chegar no início/fim (o JS aplica `is-start`/`is-end`).
- **Mobile/touch:** sem setas — a fileira é arrastada com o dedo (swipe nativo). Os degradês nas
  pontas continuam indicando que há mais gente para o lado.

### Card (`.coordinator-card`)
Sem badge sobre a foto (tampava o rosto). A distinção é pela **cor do rótulo na base**:
**rosa = coordenação**, **ciano = palestrante** (`.coordinator-card--speaker`).
Ordem das infos: rótulo → nome → **empresa** (destaque) → cargo (menor e apagado).
Palestrante sem empresa: **omitir** a linha `.coordinator-company` — nunca usar placeholder.

O bloco de texto do card tem **altura fixa** (`--track-info-h`), dimensionada para o pior caso
(nome em 2 linhas + empresa + cargo em 3 linhas). É o que mantém todos os cards do mesmo tamanho
**entre as 4 trilhas**, não só dentro de uma fileira. Nenhum cargo é truncado — cargo mais longo
que isso pede aumentar a variável, não cortar o texto.

### Cards "Em breve" (`.coordinator-card--soon`)
A fileira tem largura **fixa de 1112px** no desktop (o `.container` trava em 1160px). Com 3–4
pessoas confirmadas sobrava um vão à direita, então cada trilha é completada até **7 cards** com
placeholders de silhueta e o nome "Em breve".

- Silhueta desenhada em **CSS puro** (`.soon-avatar`, pseudo-elementos) — zero requisição, zero KB.
- `aria-hidden="true"`: são decorativos, não entram na lista para leitor de tela.
- Aparecem **só a partir de 1160px**. Abaixo disso somem — se ficassem, virariam overflow e o
  usuário rolaria a fileira no celular só para encontrar "Em breve".
- A conta: `7 × 148 + 6 × 12 = 1108`, contra 1112px disponíveis.

> **Ao confirmar um palestrante, SUBSTITUA um card "Em breve"** pelo card real, em vez de
> acrescentar. Assim o total continua 7 e a fileira segue fechada. Passando de 7 confirmados os
> placeholders já acabaram, é só somar cards e a fileira passa a rolar de verdade.

### Coordenação das trilhas

| Trilha | Coordenador 1 | Coordenador 2 |
|--------|---------------|---------------|
| **Product Management** | Eduardo Borges — Monuv | Ingrid Coutinho — Itaú |
| **Building & Automation** | Gabriel Werlich — Conta Mais | Talita Paoletti — Grupo Boticário |
| **Marketing & Design** | Mariana Tosi — Insider One | Alex Soares — Totvs |
| **Liderança & Negócios** | Rafael Justino — Serrabits | Fernanda Faria — Nubank |

A **Coordenação Geral** (Priscila Lugão — Product Coordinator, Med Review) não aparece mais dentro
das trilhas: ganhou dobra própria (`.general-coord`) logo abaixo do bloco de trilhas.

### Recursos técnicos
- Layout responsivo — a fileira só encolhe a largura do card (`--track-card-w`)
- Scroll nativo com `scroll-snap` — sem biblioteca de carrossel
- `ResizeObserver` recalcula `is-start`/`is-end` quando a fileira muda de largura
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
3. Encontre a `.track-row` da trilha desejada (elas estão comentadas: `TRILHA 1`, `TRILHA 2`…)
4. Localize o **primeiro card "Em breve"** (`coordinator-card--soon`) da fileira e **substitua o
   bloco inteiro** pelo card real. Se a trilha já não tiver mais nenhum "Em breve", aí é só colar
   no fim da fileira (coordenadores primeiro, palestrantes depois):

```html
<article class="coordinator-card coordinator-card--speaker" role="listitem">
  <div class="coordinator-photo-wrap">
    <img src="assets/img/speakers/sp-nome.webp" width="400" height="400"
         alt="Foto de Nome Completo, Cargo na Empresa" loading="lazy">
  </div>
  <hr class="coordinator-divider">
  <div class="coordinator-info">
    <span class="coordinator-role">Palestrante</span>
    <div class="coordinator-name">Nome Completo</div>
    <div class="coordinator-company">Empresa</div>
    <div class="coordinator-title">Cargo</div>
  </div>
</article>
```

Para **coordenação**, remova o modificador `coordinator-card--speaker` (rótulo volta ao rosa) e
troque o rótulo para `Coordenação`. **Sem empresa confirmada:** omita `.coordinator-company`.
Não é preciso mexer em altura nem em nenhum CSS.

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

# Product Camp 2026 — Site Oficial

Site oficial do **Product Camp Brasil 2026**, o maior evento de produtos digitais da América Latina.
Desenvolvido inteiramente em HTML, CSS e JavaScript puros — sem frameworks, sem dependências externas pagas.

**URL:** [jaquelinesantospm3.github.io/productcamp2026](https://jaquelinesantospm3.github.io/productcamp2026)
**Evento:** 08 e 09 de dezembro de 2026 — Centro de Convenções Frei Caneca, São Paulo, SP

---

## Estrutura de arquivos

```
productcamp2026/
│
├── index.html                  # Site completo (HTML + CSS + JS em um único arquivo)
│
├── logo_escuro.svg             # Logo PCamp — versão fundo escuro (nav e footer)
├── logo_claro.svg              # Logo PCamp — versão fundo claro
├── logo_branco.png             # Logo PCamp — versão branca
│
├── favicon.png                 # Favicon 32x32 (aba do browser)
├── favicon-16.png              # Favicon 16x16
├── apple-touch-icon.png        # Ícone iOS 180x180 (salvar na tela inicial)
│
├── hero-bg.webp                # Imagem de fundo do hero (palco com plateia)
├── about-bg.webp               # Imagem de fundo seção User/Builder/Thinker/Leader
├── quote-bg.webp               # Imagem de fundo da frase destaque
├── tickets-stage.webp          # Imagem de fundo da seção de ingressos
├── tickets-crowd.webp          # Imagem de fundo do banner de grupos
│
├── venue-networking.webp       # Foto espaço de networking (seção local)
├── venue-selfie.webp           # Foto participantes no PCamp (seção local)
├── venue-cagan.webp            # Foto Marty Cagan com participante VIP (seção local)
│
├── trilha-pm.webp              # Foto trilha Product Management
├── trilha-ai.webp              # Foto trilha Building & Automation
├── trilha-lideranca.webp       # Foto trilha Liderança & Negócios
├── trilha-marketing.webp       # Foto trilha Marketing & Design
├── trilhas-icons.png           # Ícones visuais das trilhas
│
├── sp-marty.webp               # Foto Marty Cagan
├── sp-diego.webp               # Foto Diego Barreto
├── sp-melissa.webp             # Foto Melissa Perri
├── sp-eduardo.webp             # Foto Eduardo Thuler
├── sp-neha.webp                # Foto Neha Nathan
├── sp-trisha.webp              # Foto Trisha Price
├── sp-nathalia.webp            # Foto Nathalia Andrijic
├── sp-martina.webp             # Foto Martina Lauchengco
├── sp-leah.webp                # Foto Leah Tharin
├── sp-david.webp               # Foto David Pereira
│
├── minders.svg                 # Logo patrocinador Minders
├── mixpanel_.svg               # Logo patrocinador Mixpanel
├── fiap_.svg                   # Logo apoio FIAP
├── logo-pm3.svg                # Logo realização PM3
├── hipsters.svg                # Logo apoio Hipsters Network
├── clevertap.avif              # Logo patrocinador CleverTap
├── pendo_.avif                 # Logo patrocinador Pendo
├── replit_.avif                # Logo patrocinador Replit
├── Alun_.avif                  # Logo apoio Alun
├── alura_.png                  # Logo apoio Alura
├── casa_do_codigo.avif         # Logo apoio Casa do Código
│
└── fonts/
    ├── INTERTIGHT-REGULAR.TTF
    ├── INTERTIGHT-MEDIUM.TTF
    ├── INTERTIGHT-SEMIBOLD.TTF
    └── INTERTIGHT-LIGHT.TTF
```

---

## Seções do site

| Seção | Descrição |
|---|---|
| **Nav** | Fixo, transparente no topo e sólido ao scroll. Links: FAQ, Speakers, Patrocine, Pocket + CTA "Garantir ingresso" |
| **Hero** | Mote da edição: *User. Builder. Thinker. Leader.* com imagem de fundo do evento |
| **Stats** | +80 palestrantes, 6 palcos, +3.000 participantes, 2 dias — com contador animado ao scroll |
| **About** | Seção "Você é usuário, construtor, pensador e líder" com 4 pilares em grid 2×2, imagem de fundo com elementos gráficos do branding |
| **Quote** | Frase destaque com foto de fundo: *"Serão dois dias para exercitar tudo isso..."* |
| **Público** | Marquee duplo animado (ciano + rosa) com os perfis de participantes |
| **Trilhas** | 4 cards com fotos reais: Product Management, Building & Automation, Liderança & Negócios, Marketing & Design |
| **Speakers** | Grid 5 colunas com cards verticais — foto, empresa, nome e cargo. 10 palestrantes da edição 2025 |
| **Local** | Layout 2 colunas: texto âncora à esquerda + mosaico de 3 fotos à direita |
| **Ingressos** | Imagem de fundo do palco, 2 cards (Passaporte e VIP) com preços Lote 1 + banner de grupos |
| **Patrocinadores** | 3 tiers: Patrocinadores, Apoio e Realização — logos reais em branco |
| **Hotéis parceiros** | 3 cards com informações completas de hospedagem parceira com desconto |
| **FAQ** | Acordeão com 6 perguntas frequentes + link para FAQ completa |
| **Footer** | Logo, redes sociais, links úteis, legal e copyright PM3 |

---

## Tecnologia

- **HTML/CSS/JS puros** — zero dependências, zero frameworks
- **Fonte:** Inter Tight (carregada localmente via `@font-face`)
- **Imagens:** todas convertidas para `.webp` (redução média de 85-99% de peso)
- **Hospedagem:** GitHub Pages (gratuito)
- **Domínio:** configurável via DNS no painel do registrador

---

## Como atualizar o site

### Atualizar um texto
1. Abra `index.html` no VS Code (ou Bloco de Notas)
2. Use `Ctrl+F` para encontrar o trecho
3. Edite e salve
4. Faça upload no GitHub → o site atualiza em ~1 minuto

### Adicionar um palestrante
Copie o bloco abaixo e cole dentro de `.speakers-grid` no `index.html`:

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

Suba também a foto em `.webp` na raiz do repositório.

### Adicionar um patrocinador
Copie o bloco abaixo e cole dentro da `.sponsors-logos` do tier correto:

```html
<a href="https://site-da-empresa.com" target="_blank" class="sponsor-logo">
  <img src="logo-empresa.svg" alt="Nome da Empresa">
</a>
```

### Atualizar preço / lote de ingresso
Procure no `index.html` por `R$ 1.099` (Passaporte) ou `R$ 1.599` (VIP) e substitua pelo novo valor.
Para trocar o lote, procure por `LOTE 1` e atualize.

### Atualizar imagem de qualquer seção
Substitua o arquivo na raiz do repositório pelo novo, **mantendo exatamente o mesmo nome de arquivo**.
O site passa a usar a nova imagem automaticamente.

---

## Publicação no GitHub Pages

### Primeira publicação
1. Crie repositório público no GitHub
2. Faça upload de todos os arquivos (raiz + pasta `fonts/`)
3. Vá em **Settings → Pages → Branch: main → Save**
4. Site fica disponível em `seuusuario.github.io/productcamp2026`

### Domínio customizado
1. Em **Settings → Pages → Custom domain:** insira `www.productcamp.com.br`
2. No painel de DNS do registrador, crie:

| Tipo | Nome | Valor |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | seuusuario.github.io |

### Atualizações
1. Acesse o repositório no GitHub
2. **Add file → Upload files**
3. Arraste os arquivos novos (substituem automaticamente os antigos de mesmo nome)
4. **Commit changes** — site atualiza em ~1 minuto

---

## Branding

| Elemento | Valor |
|---|---|
| Cor primária (navy) | `#2B1E39` |
| Rosa / pink | `#DF0C78` |
| Ciano | `#18CEF4` |
| Branco | `#FFFFFF` |
| Fonte | Inter Tight (Light, Regular, Medium, SemiBold) |
| Logo nav/footer | `logo_escuro.svg` (fundo transparente, texto branco) |

---

## Créditos

**Organização:** PM3
**Desenvolvimento:** Gerado e mantido com Claude (Anthropic)
**Hospedagem:** GitHub Pages

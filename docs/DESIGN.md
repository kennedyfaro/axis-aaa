# Design

## Leitura do brief

> Uma console de operações de rede para engenheiros de NOC, administradores e auditores, em ambiente de baixa luminosidade, com linguagem de sala de controle industrial: tabelas densas, réguas finas, identificadores em monoespaçado e hierarquia por peso e espaço, não por cor.

Registro: **Operate** (app administrativo). Dials aplicados: variância 4, movimento 3, densidade 7.

## Por que tema escuro único

A tarefa é Operate e o cenário é monitoramento 24x7 em sala de operação. Um único tema escuro evita alternância de contexto e mantém a leitura de tabelas estável. Não há alternância de tema por seção. A justificativa está registrada aqui, conforme a regra de tema único.

## Tipografia

- **Archivo** para interface, títulos e tabelas. Grotesca industrial, com boa legibilidade em 11 a 13 px.
- **JetBrains Mono** para login, endereços IP, IDs, datas, números e código. Reforça a leitura de dados operacionais.
- Escala fixa em rem, não fluida: 10, 11, 12, 12.5, 13, 15, 18, 22, 26 px.
- Títulos com `letter-spacing` entre -0.02em e -0.035em. Corpo entre 1.4 e 1.6 de altura de linha.

## Cor

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#0A0C0E` | Fundo da aplicação |
| `--panel` | `#0E1114` | Painéis e superfícies |
| `--panel-2` | `#12161A` | Hover de linha e superfície secundária |
| `--panel-3` | `#171C21` | Controles ativos e popovers |
| `--line` | `#222A31` | Réguas e bordas |
| `--fg` | `#E9E6DE` | Texto principal |
| `--muted` | `#A3ACB3` | Texto secundário |
| `--dim` | `#7E888F` | Metadados e rótulos |
| `--accent` | `#E2653F` | Ação primária, seleção, foco e série aceita |
| `--ok` | `#86B37A` | Estado operacional |
| `--warn` | `#D9A441` | Degradação e expiração |
| `--danger` | `#E06A63` | Falha, rejeição e ação destrutiva |

Uma única cor de acento. Verde, âmbar e vermelho existem apenas como vocabulário semântico de estado, nunca como decoração. Não há gradiente de texto, glassmorphism, roxo de IA ou sombra difusa combinada com borda.

## Forma e superfície

- Raios: 3 px para tags, 6 px para controles, 8 px para popovers, 10 px para painéis. Nenhum cartão acima de 10 px.
- Painéis são delimitados por uma régua de 1 px. Não há cartões flutuantes com sombra decorativa.
- Divisórias agrupam conteúdo; não se usa `border-top` e `border-bottom` em todas as linhas.
- A ação primária é um botão claro (osso) sobre o fundo escuro. O laranja é reservado para foco, seleção e estado ativo.

## Layout

- Sidebar de 244 px em desktop, trilho de ícones de 64 px entre 768 e 1280 px, drawer em telas menores.
- Topbar de 56 px com trilha de navegação, busca global (`Ctrl K`) e menu da conta.
- Conteúdo com largura máxima de 1520 px, respiro de 24 a 32 px.
- Tabelas densas com 40 a 60 px de altura por linha. Em telas pequenas, a tabela vira lista de cartões com as mesmas ações.
- O dashboard usa uma faixa única de quatro indicadores, não quatro cartões soltos. O gráfico ocupa 8 colunas e a coluna de contexto ocupa 4.

## Movimento

- Transições de 100 a 180 ms, sempre em propriedades específicas.
- Curva `cubic-bezier(0.23, 1, 0.32, 1)` para entrada.
- Modais entram com opacidade e escala 0.96; popovers usam a origem do gatilho via variável do Radix.
- `prefers-reduced-motion` reduz tudo para 0.01 ms.
- Nenhuma animação de carregamento orquestrada. A tela carrega direto na tarefa.

## Estados

- Toda consulta tem skeleton no formato do conteúdo final, estado vazio com orientação e erro com ação de repetir.
- Formulários têm rótulo acima, ajuda abaixo, erro abaixo e `aria-describedby` implícito no campo.
- Botões têm hover, foco visível, ativo (`scale 0.98`), desabilitado e carregando.
- Interações destrutivas pedem confirmação e deixam claro que o evento vai para a auditoria.

## Conteúdo

- Sem em dash, sem jargão de marketing, sem números inventados sem contexto.
- Nomes e dados do seed são orgânicos e identificáveis como ambiente local.
- O banner de ambiente explica que os dados estão no PostgreSQL e que o tráfego RADIUS é real.
- Permissões e ações não implementadas são declaradas como pendências, não simuladas.

## Responsividade

- 390 px: sidebar em drawer, topbar compacta, métricas em 2 colunas, tabelas em cartões, ações essenciais visíveis.
- 768 px: sidebar em trilho de ícones, tabelas completas com rolagem horizontal quando necessário.
- 1280 px e acima: sidebar completa e dashboard em 12 colunas.

## Acessibilidade

- Contraste mínimo de 4.5:1 para corpo e 3:1 para texto grande.
- Foco visível em todos os controles, com anel de 2 px do acento.
- Alvos de toque de no mínimo 28 px na interface densa e 44 px nos controles móveis.
- Gráfico com resumo textual e tabela oculta para leitores de tela.
- Status usados apenas quando comunicam estado real.

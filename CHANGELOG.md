# Changelog do isaCloud Web

Mudanças exclusivas do fork isaCloud do Converse, na ordem em que foram
publicadas em <https://chat.isacloud.cc>.

A versão segue o formato `v15-<build>`. O build começa em **0** no primeiro
commit do fork (`3ecd1c1bc`) e aumenta de **1 em 1 a cada publicação**. A
release atual fica registrada em [RELEASE-ISACLOUD.md](RELEASE-ISACLOUD.md).

## v15-26 — 2026-11-14 (`b833b9188`)

- `feat(roster)`: a lista de contatos passa a ser totalmente alfabética pelo
  nome exibido, ignorando maiúsculas/minúsculas e acentos; o status de presença
  não reordena mais a lista (PR #18, `2b1d6d93f`).

## v15-25 — 2026-11-14 (`175491517`)

- `feat(isacloud)`: a lista de conversas recentes deixa de mostrar canais cujo
  MAM veio vazio. O canal só é escondido depois que o histórico assenta
  (`mam_initialized`) e não há mensagem exibível; mensagens de sistema, erros e
  retratações não contam como conteúdo. O canal volta quando chega uma mensagem
  (`92de8b396`).

## v15-24 — 2026-11-14 (`dbbb4a68f`)

- `fix(isacloud)`: a conversa para de "pular" durante o carregamento do MAM. A
  lista curta fica colada embaixo e a caminhada automática pausa depois de duas
  páginas sem nada visível, com botão para carregar mensagens anteriores
  (PR #17).

## v15-23 — 2026-11-14 (`7159104ea`)

- `fix(isacloud)`: a janela da lista de mensagens acompanha a mensagem mais nova.
  Reações penduradas não ocupam mais as 101 vagas e a janela segue o fim quando
  não há o que rolar (PR #16).

## v15-22 — 2026-11-13 (`f5bbee33d`)

- `feat(isacloud)`: as próprias mensagens ganham fundo cinza-claro, pela classe
  `chat-msg--self` no tema (PR #15).

## v15-21 — 2026-11-13 (`44e7adf77`)

- `fix(texture)`: linha em branco entre parágrafos preservada nas mensagens
  (PR #14).

## v15-20 — 2026-11-13 (`cd841736d`)

- `fix(muc)`: painel do participante com o cadeado certo em canal, botão
  "Conversa cifrada" em grupo privado e traduções pt_BR (PR #12).
- `feat(muc)`: "Adicionar grupo" cria grupo privado, `membersonly`,
  não anônimo, não público e persistente; "Adicionar canal" mantém o padrão do
  servidor (PR #13).

## v15-19 — 2026-11-13 (`d2152a2d8`)

- `fix(isacloud)`: o resource XMPP passa a ser `isaCloudWeb-<número>` em vez de
  `converse.js-<número>`, com a configuração `resource_prefix` no núcleo
  (PR #11).

## v15-18 — 2026-11-13 (`dcf80196f`)

- `fix(isacloud)`: o aviso de nova versão gira no clique e recarrega em até 2
  segundos, mesmo com o Chrome demorando para limpar o cache (PR #10).

## v15-17 — 2026-11-13 (`305acd4bc`)

- `feat(isacloud)`: aviso de nova versão ao lado da engrenagem. O
  `build.sh` grava a versão no `version.json`, na página e no `?v=` do JS e do
  CSS (PR #9).
- nginx passa a usar `no-cache` em `/dist/`, `no-store` no `version.json` e o
  endereço `/atualizar` com `Clear-Site-Data: "cache"`.

## v15-16 — 2026-11-13 (`156714be8`)

- `fix(i18n)`: menu da mensagem em pt_BR — Responder, Reagir, Citar, Retirar; e
  Moderar no menu do canal (PR #8).

## v15-15 — 2026-11-13 (`52738b6a1`)

- `feat(isacloud)`: figurinhas no formato do iOS (upload e `<sticker/>` vazio),
  com receber, mostrar, biblioteca por navegador, enviar pelo clipe e atalho
  próprio, salvar a recebida e editor (PR #7).

## v15-14 — 2026-11-13 (`163375782`)

- `fix(isacloud)`: os rótulos CANAIS (rosa) e GRUPOS (azul) em Contatos mantêm
  a cor certa ao ganhar a setinha e virar links (PR #6).

## v15-13 — 2026-11-13 (`100c27556`)

- `feat(isacloud)`: conversa flutuante (PR #5) — cartões com sombra, avatares
  redondos, modais modernas, botões rosa, tópico escondido, entradas e saídas
  ocultas, Grupos e Canais separados e recolhíveis, busca de canais em todos os
  servidores de salas, sugestão de menção legível no claro e no escuro; logout
  em tela cheia não reabre mais uma sala sobre o login.

## v15-12 — 2026-11-13 (`0f8efb3bb`)

- Merge da lista única de conversas (PR #3) e do fix de convites repetidos
  (PR #4) na branch `isacloud`. Suíte reduzida: 306 + 28 testes.

## v15-11 — 2026-11-13 (`7fb04800d`)

- `fix(isacloud)`: a coluna de participantes termina arredondada na linha da
  caixa de mensagem, descontando as margens. Só CSS.

## v15-10 — 2026-11-13 (`5cfe09aea`)

- `feat(isacloud)`: participantes de grupos e canais no estilo da lista — coluna
  mais larga (26% do cartão, 260 a 320 px a partir de 1200 px), sem a linha rosa
  de divisão, status no canto do avatar e etiquetas em pílula. Só CSS.

## v15-9 — 2026-11-13 (`ad3fba578`)

- `fix(isacloud)`: ajustes da lista de conversas — lateral mais larga (40% no
  tablet, 1/3 em tela média, 25% entre 300 e 400 px em tela grande), lista mais
  à esquerda, margem direita da conversa, selos de grupo (somente membros e não
  anônima) e canal no canto superior esquerdo.

## v15-8 — 2026-11-13 (`969c38f5f`)

- `feat(isacloud)`: lista única de conversas no estilo do iOS (filtros, selos,
  prévia, não lidas e hora) e contatos sem grupos (`roster_groups: false`, com
  correção no rosterview). Configuração `show_recent_list` (desligada no
  Converse, ligada na página).

## v15-7 — 2026-11-13 (`937b21270`)

- `feat(isacloud)`: a tela de login fica fora dos cartões do visual flutuante
  (PR #2).

## v15-6 — 2026-11-13 (`7ad912a88`)

- `feat(isacloud)`: visual flutuante (PR #1) — lateral e conversa como cartões
  arredondados com sombra, caixa de digitação e avisos arredondados, botão de
  enviar redondo. Só CSS; no celular continua de ponta a ponta.

## v15-5 — 2026-11-12 (`3add91483`)

- `fix(omemo)`: linhas de erro OMEMO gravadas pela versão anterior viram
  contagem do aviso, em vez de sumirem e deixarem o aviso invisível.

## v15-4 — 2026-11-12 (`22aa61682`)

- `feat(omemo)`: mensagens OMEMO sem chave para este navegador viram um aviso só
  por conversa, acima da caixa de digitação, com contagem separada de histórico
  e de recentes e botão "Entendi".
- `fix(omemo)`: ids de prekey tratados como número, tirando dois erros de tipo.

## v15-3 — 2026-11-12 (`0e73c09d5`)

- `fix(omemo)`: mensagens OMEMO sem corpo (chat state, marker, heartbeat) não
  levam mais a marca EME (XEP-0380), evitando o aviso "encrypted with OMEMO:2" no
  Gajim.
- Configuração: storage persistente em IndexedDB, apelido do JID nos canais,
  somente o app Chat, fonte do sistema e `v15-isaCloud` como `VERSION_NAME`.
- Primeira publicação feita pelo `deploy-srv07.sh`.

## v15-2 — 2026-11-12 (`5ee659f3a`)

- `fix(isacloud)`: balão centralizado sobre o formulário de login e rodapé
  "ConverseJS master-fork", com o nome do build.

## v15-1 — 2026-11-12 (`199917324`)

- `fix(isacloud)`: página corrigida com `show_background: false` para o balão do
  topo aparecer; metadados do macOS ficam fora do tarball do build.

## v15-0 — 2026-11-12 (`3ecd1c1bc`)

- Primeira publicação: marca isaCloud (temas claro e escuro, balão, menu e
  rodapé) e build estático para <https://chat.isacloud.cc>.

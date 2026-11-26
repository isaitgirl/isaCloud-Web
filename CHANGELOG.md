# Changelog do isaCloud Web

Mudanças exclusivas do fork isaCloud do Converse, na ordem em que foram
publicadas em <https://chat.isacloud.cc>.

A versão segue o formato `v15-<build>`. O build começa em **0** no primeiro
commit do fork (`3ecd1c1bc`) e aumenta de **1 em 1 a cada publicação**. A
release atual fica registrada em [RELEASE-ISACLOUD.md](RELEASE-ISACLOUD.md).

## v15-44 — 2026-11-26 (`3b7502b0c`)

- `chore(upstream)`: merge do `upstream/master` até `718feadc1e`. A UI foi reestruturada em
  `src/web/` (plugins, apps, shared e templates saíram de `src/`), entrou o modo offline do
  Converse 15 (UI utilizável sem conexão, sessão lembrada e mensagens escritas offline
  enviadas ao reconectar) e os tipos passaram a ser um `.d.ts` por pacote. O detalhe do
  upstream está em `CHANGES.md`.
- `fix(isacloud)`: adaptação do fork ao modo offline — strings pt-BR novas, marcador de
  mensagem não enviada em linha própria no celular, linha do changelog quando a sessão vem do
  cache e o spinner da lista de canais.
- `fix(composer)`: o texto digitado antes de o editor Lexical terminar de carregar não é mais
  apagado no `attach`, e o placeholder some assim que há texto; o chunk do editor passa a ser
  baixado quando o navegador fica ocioso.
- `fix(bookmarks)`: a sala aberta pelo bookmark não é mais criada com `hidden`. O bookmark
  criado em `enteredNewRoom` chega depois de a sala aparecer, e o `hidden` escondia a sala que
  o usuário acabou de abrir.
- `test`: spec novo em `bookmarks.js` (sala vinda do bookmark continua visível) e em
  `message-form.js` (texto preservado antes do `attach`); os dois entraram na suíte reduzida.

## v15-43 — 2026-11-25 (`a3113d27a`)

- `fix(connection)`: uma queda curta do servidor (o restart do Prosody para a 13.0.8, de
  ~1 s) não leva mais o web para o BOSH. Uma tentativa de WebSocket que falha reporta
  CONNFAIL duas vezes no Strophe (`error` e depois `close` 1006), e cada relato contava
  como uma falha: a primeira tentativa já trocava de transporte. A falha agora é contada
  uma vez por tentativa (`#attempt_failed`, zerado em CONNECTING e ao conectar), então a
  queda curta repete o WebSocket e retoma a sessão.
- `fix(connection)`: quando o BOSH entra no lugar de um WebSocket que funcionava nesta
  página, o cliente abre um WebSocket de teste a cada 5 min; se abrir, encerra o BOSH e
  reconecta pelo WebSocket. Se a volta falhar, a espera dobra até 1 h. A queda de um BOSH
  substituto (inclusive o `terminate` de sessão esquecida depois de um freeze) tenta o
  WebSocket primeiro. No BOSH o Strophe não usa Stream Management, por isso ficar nele
  significava login novo a cada freeze. Diagnóstico: `transport_probe` e
  `transport_return`.
- `test`: 7 specs em `reconnection.js`; `reconnection.js` e `diagnostics.js` entraram na
  suíte reduzida do fork.

## v15-42 — 2026-11-25 (`f1583d46e`)

- `fix(composer)`: Shift+Enter volta a quebrar a linha num compositor que ainda não
  tinha sido digitado. A seleção inicial é um *element point* na raiz, onde o Lexical
  descarta um `LineBreakNode` sozinho: sobrava só o `<br>` que dá altura ao parágrafo
  vazio, o modelo continuava vazio e o texto seguia na primeira linha (no Safari, o
  caminho nativo de `beforeinput` também não colocava a quebra no modelo). O editor
  compartilhado passou a tratar `KEY_ENTER_COMMAND` em `COMMAND_PRIORITY_HIGH`, antes
  do rich-text, e ancora a primeira quebra com um espaço invisível — removido pelo
  `trim` no envio. Vale para 1:1, grupos e Social.
- `test`: dois specs de teclado real (`userEvent`) em `message-form.js`, com o composer
  vazio e no meio do texto; o arquivo e o `compose-rich.js` do Social entraram na suíte
  reduzida do fork, com 667 + 36 testes e `types:check`.

## v15-41 — 2026-11-24 (`895b1ef78`)

- `feat(isacloud)`: ao criar uma vídeo conferência, o link de anfitrião também é
  enviado para o próprio bare JID, na conversa “Notas para si mesmo”, pelo fluxo
  normal de `sendMessage` (chega aos outros dispositivos). A nota é marcada como
  não lida com `num_unread` e `first_unread_id`, então o badge aparece e a conversa
  entra nos recentes mesmo quando só existia em Contatos; não abre nem desmarca a
  conversa por conta própria. Se a nota falhar, a conferência continua e o aviso
  antigo aponta para a caixa de mensagem.
- `feat(modal)`: o toast ganhou `action` (rótulo + handler), `placement: "composer"`
  e `appearance: "light"`. O aviso da conferência usa a ação **Ver** para abrir a
  conversa, fica logo acima do composer medindo o topo real do formulário visível,
  alinhado à borda esquerda do cartão da conversa, com fundo cinza claro, texto
  escuro e “Ver” rosa.
- `fix(modal)`: o corpo do toast deixou de usar `w-100`; o container ganhou respiro
  à direita e o toast recorta o arredondamento, para a ação não escapar da borda.
  `converse-toasts` usa `z-index: 1060`, acima do cartão da conversa.
- `fix(i18n)`: strings pt-BR do link de anfitrião, do “Ver” e da nota.
- `test`: specs de `host-link` (nota enviada, não lida, badge/recentes, conversa só
  em Contatos, conversa já existente e fallback), de ação/posicionamento/aparência
  do toast; ambos entram na suíte reduzida do fork, com 642 + 36 testes e
  `types:check`.

## v15-40 — 2026-11-24 (`7de34fb8a`)

- `fix(chat)`: o menu de ações da mensagem fecha ao clicar fora mesmo quando o alvo
  interrompe o evento — os botões de emoji e de anexos do compositor fazem
  `stopPropagation`, e o listener no `document` passou a rodar na fase de captura, em
  `pointerdown` e `click`. Escolher um item também fecha. Em canais com muitas ações e
  pouco espaço (mensagem própria com 5 itens num composer alto), o menu escolhe o lado com
  mais espaço e limita a altura ao `.chat-content__messages`, rolando internamente em vez
  de cobrir o composer; o Popper `fixed` usa `altBoundary` para enxergar a lista como
  boundary.
- `feat(chat)`: visualizador de imagem com a largura do diálogo adaptada ao tamanho
  intrínseco da imagem (até `92vw`/1100 px; antes ficava preso aos 500 px do Bootstrap),
  com a imagem centralizada. Um clique alterna entre ajustada e **1:1**; em 1:1 o corpo
  rola nos dois eixos e o botão esquerdo pressionado arrasta a imagem, sem pan no hover.
  No toque, o scroll continua nativo; arrastar não desfaz o zoom por acidente, e o clique
  após um arrasto é suprimido.
- `fix(i18n)`: o menu do clipe de anexos fala pt_BR: “Adicionar anexo”, “Enviar um
  arquivo”, “Enviar uma imagem”, “Compartilhar sua localização” e “Gravar mensagem de
  voz”.
- `test`: specs de `dropdown-position` (1:1 e canal, clique fora no botão de emoji, clique
  no item, menu maior que a área de mensagens), `image-modal` (largura adaptativa, zoom,
  arrasto e ausência de pan no hover) e a tradução do `attachment-menu`; os três entram na
  suíte reduzida do fork (636 + 36 testes) e `types:check`.

## v15-39 — 2026-11-23 (`72b10f4d2`)

- `feat(isacloud)`: “Novidades do isaCloud” na lista de conversas. Plugin novo
  `converse-isacloud-changelog`: o `CHANGELOG-USERS.md` vira `changelog.json` embutido
  (gerado por `scripts/generate-changelog-json.mjs`, conferido no build e na suíte), e um item
  fixo acima das conversas fixadas abre uma view no lugar da conversa, com o lote de releases
  desde a última abertura (primeira execução mostra só a release atual). Estado por conta
  (`u.initStorage`): lido e arquivado por versão; o ícone de arquivar só existe nessa linha e
  não apaga o acesso em Configurações → Sobre. O item aparece só na visão de Conversas com o
  filtro “Todas”. A view não é um `ChatBox`: é um card anexado ao app de Chat, posicionado pelo
  `isa-split` no desktop e ocupando a área do app no celular. Textos pt-BR no plugin, sem
  `.po`; ícone `box-archive` acrescentado ao sprite. Specs de `batch`, estado, linha e view.

## v15-38 — 2026-11-23 (`72f56a4a7`)

- `feat(recent-list)`: conversas podem ser fixadas no topo da lista, até **3** por conta. O
  estado fica em `pinned_order` no chatbox (local, por navegador), então sobrevive a reload e
  reconexão sem sincronizar com o servidor. As fixadas vêm primeiro, na ordem em que foram
  fixadas; os filtros continuam valendo para elas; uma conversa fixada não some por estar sem
  conteúdo exibível. O indicador é um alfinete à direita da linha, sem seção “Fixadas”.
- `feat(recent-list)`: o mesmo “Fixar no topo”/“Desafixar do topo” aparece no menu do cabeçalho
  da conversa (1:1, grupo, canal e “Notas para si mesmo”), e os dois lugares compartilham o
  mesmo estado e limite.
- `fix(roomslist)`: a lista de Contatos não oferece mais um segundo pin por bookmark. No
  isaCloud e no custom `mdq`, `allow_room_pinning: false` esconde a ação e ignora bookmarks já
  fixados, deixando a fixação só na lista de Conversas.
- `fix(dropdown)`: item de menu indisponível fica cinza, com opacidade reduzida e sem executar
  a ação, para o limite de 3 ficar visível.
- `test`: 23 specs do recent-list (pin pela lista e pelo cabeçalho, ordem, limite, filtros,
  persistência e alfinete) e spec do roomslist sem pin; suíte reduzida com 598 + 36 testes e
  `types:check`.

## v15-37 — 2026-11-23 (`970eda5a9`)

- `fix(chat)`: resposta que cita uma URL não some mais. O Gajim cita o **link do upload**
  quando responde a foto, vídeo ou arquivo; os offsets de mídia (`media_urls`) e de menções
  eram contados no corpo inteiro, incluindo a citação, e o renderizador os aplicava no texto
  já sem a citação — o intervalo da URL invadia o texto visível e o template de mídia engolia
  o resto da mensagem. Agora o modelo expõe `getReplyFallbackOffset()` e o corpo da mensagem
  renderiza com esse deslocamento; `addReplyFallback` desloca `media_urls` junto com
  `references`, e um intervalo que passe do texto é ignorado em vez de substituir o resto.
  O mesmo deslocamento corrige menções em respostas.
- `test`: specs com o stanza real do canal Blambers (resposta do Gajim a um vídeo, URL com
  `%20`, `end=132`) e com resposta que tem URL no próprio texto; suíte reduzida com 588 + 36
  testes e `types:check`.

## v15-36 — 2026-11-23 (`e2f50d6e4`)

- `feat(isacloud)`: respostas XEP-0461 compatíveis com o iOS e o Android. Com OMEMO antigo
  (o único que os dois apps falam), o `<reply>` e o `<fallback>` passam a ir **em claro**,
  como irmãos do `<encrypted>`, com o range calculado no corpo antes de cifrar — antes o
  telefone recebia a resposta sem referência nenhuma. A leitura do `<reply>` em claro já
  funcionava e ganhou teste de regressão.
- `feat(isacloud)`: leitura do marcador antigo `<isacloud-quote>`, com o fallback sintetizado
  a partir do bloco `>` do corpo (do `plaintext` quando a mensagem é cifrada). Sem isso, as
  respostas antigas do Android apareciam com cartão **e** citação dupla.
- `feat(isacloud)`: o Web volta a mandar `<isacloud-quote>` nas respostas a foto, GIF e
  figurinha, fora da criptografia, com o mesmo id do `<reply>`, enquanto o Android não lê
  `<reply>` (`SEND_ISACLOUD_QUOTE`; a leitura fica para sempre).
- `feat(isacloud)`: a citação de mídia usa um marcador (“📷 Foto”, “🎞️ GIF”, “🎬 Vídeo”,
  “🎵 Áudio”, figurinha) em vez da URL do upload — no OMEMO, a URL `aesgcm://` levava a chave
  junto. Vale para o corpo citado e para o cartão/preview.
- `feat(isacloud)`: tocar na citação leva à original. Carrega até 200 mensagens do histórico,
  **move a janela da lista virtualizada** (só 100 mensagens existem no DOM) e rola/destaca;
  original ausente, retratada ou longe demais mostra “Mensagem original indisponível”. Antes
  o toque só funcionava com a original já desenhada.
- `fix(chat)`: corrigir uma resposta remonta a citação e o fallback para o texto novo (o iOS e
  o Android desenham a citação a partir do corpo, e a correção substitui o corpo inteiro) e
  não deixa mais a mensagem corrigida em branco. A mensagem a corrigir é resolvida antes dos
  atributos de envio, porque o formulário chama `sendMessage` sem a opção `correcting`.
- `fix(chat)`: o fallback da resposta só é escondido quando a original resolve (XEP-0428 §2.2)
  e quando o range ainda casa com o corpo; cartão e preview contam em pontos de código.
- `test`: plugin `isacloud-replies` com 32 specs (fallback sintetizado, OMEMO antigo e OMEMO
  2, marcador de mídia, correção e pulo); suíte reduzida com 586 + 36 testes e `types:check`.

## v15-35 — 2026-11-22 (`1a574c019`)

- `fix(isacloud)`: encerramento de enquete mais seguro. A original (e todas as cópias) é
  marcada como encerrada, com o tally congelado, **antes** do envio do `<poll-closed>`; se o
  envio falhar, o estado volta. Um crash no meio do envio não reabre a enquete. O cartão da
  original passa a mostrar o resultado congelado mesmo que as reações tenham sido podadas.
- `fix(isacloud)`: o `<poll-closed>` válido é aplicado na original e consumido, sem virar um
  segundo cartão. Fechamentos repetidos são ignorados; de quem entrou depois (sem a
  original) continua como cartão "Resultado final". A mensagem de fechamento enviada por nós
  também é consumida.
- `fix(chat)`: replay de MAM de uma mensagem própria sem `stanza-id`/`origin-id` não duplica
  mais em conversas 1:1 quando o arquivo reescreve o `from`; a dedupe reconhece o nosso
  `msgid` em itens arquivados. Em salas o caso já era coberto.
- `test`: specs de encerramento (ordem do envio, falha, repetição, fechamento inválido e
  original tardia) e de dedupe de replay em chat e sala; suíte reduzida com 538 + 36 testes
  e `types:check`.

## v15-34 — 2026-11-21 (`3e9bcf550`)

- `feat(isacloud)`: vídeo conferência com o Galene (`meet.isacloud.cc`). Botão de câmera na
  barra, logo depois do telefone (1:1); cria a sala pelo meet-api, guarda o `hostURL` no
  `localStorage` por conta/sala, insere o link público no compositor sem enviar e troca o link
  da mensagem pelo `hostURL` ao clicar. O CORS do meet-api ficou no nginx do srv-05.
- `feat(isacloud)`: enquetes compatíveis com o Fluux (`urn:fluux:poll:0`). Cartão no grupo, voto
  por reação XEP-0444 (enviado em claro também em OMEMO), criação pelo clipe e encerramento pelo
  criador com `<poll-closed>`; body de fallback escondido em MUC e opções fora dos chips de
  reação.
- `refactor(isacloud)`: figurinhas saem do clipe; fica só o atalho da barra.
- `test`: specs da conferência, das enquetes e das figurinhas; suíte reduzida com 536 + 31
  testes e `types:check`.

## v15-33 — 2026-11-20 (`35628287a`)

- `fix(login)`: o label do campo de login passa de “XMPP Address” para “Username”; em
  pt_BR fica “Nome de usuário”. A tradução de `Username` já existia no `.po`.

## v15-32 — 2026-11-20 (`ca8f10f96`)

- `feat(isacloud)`: marca por implantação. O fork passa a aceitar `brand_logo_url`,
  `brand_logo_link` e `brand_name` na configuração da página; quando há logo próprio, o
  componente renderiza um `<img>` com o tamanho certo para login, tela sem conversa e
  “Sobre”. As cores continuam num CSS por custom, carregado depois do tema. Sem as
  settings, o isaCloud fica exatamente como antes.
- `fix(chat)`: canal aberto por link `xmpp:...?join` não some mais. O hide do estado
  vazio (`open_last_conversation: false`) roda uma vez por login e poupa os JIDs abertos
  por `openConversation`, então o canal que o link acabou de abrir permanece na tela.
- `test`: marca por implantação e o link de canal; a suíte reduzida passou com 479 + 31
  testes e `types:check`.

## v15-31 — 2026-11-18 (`f0fb80b8a`)

- `fix(connection)`: depois de perder uma conexão que estava funcionando, a primeira
  tentativa de reconexão usa o mesmo transporte. Só a segunda falha consecutiva troca
  entre WebSocket e BOSH. Um 1006 transitório depois de freeze ou troca de rede costuma
  recuperar no mesmo transporte, e trocar para BOSH só para descobrir isso atrasava a volta.
  O diagnóstico registra `transport_retry` quando o mesmo transporte é repetido.
- `fix(server)`: o `/http-bind` do `isacloud.im` passou a devolver CORS para
  `https://chat.isacloud.cc` e a responder `OPTIONS` com 204; o fallback BOSH, que estava
  bloqueado pelo browser desde a mudança para `chat.isacloud.cc`, voltou a funcionar.
- `test`: reconnection e diagnostics cobrem a repetição do mesmo transporte e a troca
  apenas na segunda falha.

## v15-30 — 2026-11-18 (`99ba96013`)

- `feat(isacloud)`: diagnóstico de conexão em Configurações → Sobre e no rodapé da
  tela de login. O relatório reúne os últimos 24 h de eventos técnicos (quedas,
  tentativas de reconexão, fechamento do WebSocket, retomada XEP-0198, pings,
  mudanças de visibilidade/rede e erros de envio), a release, o build, o
  navegador, o sistema e o JID do próprio usuário. Não inclui mensagens, stanzas,
  JIDs de terceiros nem chaves.
- `feat(isacloud)`: store próprio em IndexedDB (`isacloud-diagnostics`), com
  janela de 24 h, teto de 5.000 entradas e fallback em memória; o arquivo pode
  ser baixado mesmo sem conexão.
- `feat(isacloud)`: envio por OMEMO para a conta de relatos, com guardas para
  conexão, suporte a OMEMO e upload. Sem essas condições o arquivo não é enviado
  em claro; o download continua disponível. A conta de destino é configurável
  (`isacloud_diagnostics_report_jid`).
- `feat(isacloud)`: o nome do arquivo passa a ser
  `isacloud-web-<release>-<data>.json` (por exemplo,
  `isacloud-web-v15.29-2026-11-18T14-21-24.json`), com a release no `meta.release`
  e o build/commit no `meta.version`.
- `feat(headless)`: evento `diagnosticEvent` para status/condição da conexão,
  tentativas e atraso da reconexão, decisão de desistir, troca de transporte,
  código/motivo do fechamento do WebSocket, condição do `<failed/>` do XEP-0198,
  timeout/erro de ping e falhas de envio. A instrumentação não grava corpo de
  mensagem nem XML.
- `test`: 9 testes no headless e 26 no plugin de diagnóstico; a suíte reduzida
  passou com 479 + 31 testes e `types:check`.
- Botão de teste que derruba a conexão: fica disponível só em
  `localhost`/`127.0.0.1` e não aparece para quem usa o chat.

## v15-29 — 2026-11-17 (`ffbb56222`)

- `feat(stickers)`: figurinha GIF. A biblioteca guarda o `format` (ausente = PNG) e
  detecta o tipo pelos primeiros bytes; o GIF é guardado e enviado byte a byte,
  como `.gif` e `image/gif`, sem passar pelo canvas.
- `feat(stickers)`: “Salvar figurinha” preserva a animação de um GIF recebido,
  com e sem OMEMO. O caminho sem OMEMO passou a ler a URL do modelo da mensagem,
  em vez de depender só do `<img>` da tela.
- `feat(stickers)`: importação de GIF por arquivo ou por link direto, com prévia,
  limite de 16 MiB e envio imediato como figurinha; o “+” com um GIF abre a
  importação em vez do editor, que achataria a animação.
- `feat(chat)`: figurinha GIF é renderizada como `<img>` nativo no quadrado de
  128 px, animando em loop e abrindo o visualizador no toque; GIFs comuns
  continuam no player `converse-gif`. O caminho OMEMO também trata figurinha sem
  extensão como imagem.

## v15-28 — 2026-11-16 (`65338e64f`)

- `feat(chat)`: “Notas para si mesmo” vira o primeiro item da seção Contatos e abre
  uma conversa normal com o próprio JID; ela só aparece nos recentes depois da
  primeira nota e não tem “Remove from list” (`44115b55c`).
- `feat(chat)`: ESC na caixa de mensagem esconde a conversa sem sair da sala; a
  área da direita mostra o balão, a versão e o aviso de criptografia. A página
  inicial do isaCloud fica nesse estado vazio, e bookmarks/`auto_join_rooms`
  entram escondidos (`346900c0a`).
- `feat(isacloud)`: o login é pedido de novo quando o navegador fecha, por meio
  de um cookie de sessão; histórico, OMEMO e configurações continuam guardados
  (`36b254662`).

## v15-27 — 2026-11-16 (`30b4a1433`)

- `fix(chat)`: mensagens digitadas durante a reconexão ficam na fila e são
  enviadas quando a conversa volta; falhas `not-connected` são reenviadas
  sozinhas após a reconexão, em vez de exigirem um novo clique.
- `fix(chat)`: o erro de falta de conexão vira um aviso discreto (toast) e a
  conversa mostra "Reconectando…" acima do compositor, legível no tema escuro.
  A reconexão é tentada na hora em `online`, `pageshow`, `focus` e ao voltar
  para a aba.
- `fix(isacloud)`: `ping_interval` caiu para 30 s.
- `fix(chat)`: as mensagens de falha de envio, os botões de reenvio e o
  indicador "Enviando…" foram traduzidos para pt_BR. A versão exibida no
  perfil e no rodapé passa a ser `v15-27` (`VERSION_NAME`).

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

# Novidades do isaCloud Web 💬💜

Versão atual: **v15-36** · atualizada em **23/11/2026**

O isaCloud Web é o chat da comunidade isaCloud: conversa boa, segurança de
verdade e um cantinho com a nossa cara. Aqui está tudo o que já chegou em
<https://chat.isacloud.cc>, release por release.

## 📅 Todas as releases

### v15-36 — 23/11/2026

- 💬 **Responder funciona igual em todo lugar:** a resposta que você manda pelo Web agora chega
  com a citação no iOS e no Android, com a miniatura quando é foto, GIF ou figurinha.
- 👆 **Toque na citação:** tocar na citação leva direto à mensagem original, mesmo quando ela é
  antiga e ainda não estava carregada na tela. Se ela não existir mais, aparece um aviso
  curtinho.
- ✏️ **Editar resposta:** corrigir uma resposta não apaga mais a citação no outro aparelho nem
  deixa a mensagem em branco.
- 🖼️ **Citação de mídia:** em vez de um link gigante, a citação mostra “📷 Foto”, “🎞️ GIF” e
  companhia.

### v15-35 — 22/11/2026

- ✅ **Enquetes mais estáveis:** encerrar uma enquete agora é definitivo na hora — se o
  envio falhar ou o app fechar no meio, ela não volta a ficar aberta.
- 🗳️ **Um cartão só:** o resultado aparece na própria enquete, com o placar congelado, e
  não se multiplica em vários cartões de "resultado" quando o fechamento chega mais de uma
  vez.
- 🔄 **Menos mensagens repetidas:** depois de recarregar ou reconectar, uma mensagem que
  você já tinha enviado não aparece mais duplicada em conversas que arquivam o histórico de
  um jeito diferente.

### v15-34 — 21/11/2026

- 📹 **Vídeo conferência:** crie uma sala pelo ícone de câmera na barra da conversa, envie o
  link e entre por ele. Quem receber o link entra pela página do meet, sem instalar nada.
- 📊 **Enquetes:** crie uma enquete no canal pelo clipe, vote tocando nas opções e veja o
  placar ao vivo. Quem criou pode encerrar; funciona junto com o Fluux, o Android e o iOS.
- ✨ **Barra mais limpa:** as figurinhas agora ficam só no atalho da barra, fora do clipe.

### v15-33 — 20/11/2026

- 🏷️ **Login mais claro:** o campo de acesso agora aparece como “Nome de usuário”, em
  vez de “Endereço XMPP”.

### v15-32 — 20/11/2026

- 🔗 **Canal por link:** ao abrir um convite de canal (`xmpp:...?join`), o canal agora
  continua aberto, em vez de aparecer e voltar para a tela de “nenhuma conversa ativa”.

### v15-31 — 18/11/2026

- 🔄 **Reconexão mais previsível:** quando a conexão cai por um congelamento da aba
  ou por uma troca de rede, o chat tenta primeiro o mesmo caminho que já estava
  funcionando antes de trocar para o alternativo. Isso evita uma demora extra
  justamente quando você volta para a aba.
- 🌐 **Conexão alternativa corrigida:** o caminho reserva voltou a funcionar para o
  chat.isacloud.cc. Se o WebSocket não voltar, o chat consegue reconectar por ele.

### v15-30 — 18/11/2026

- 🩺 **Diagnóstico de conexão:** se o chat cair ou não voltar sozinho, agora dá
  para enviar um relatório técnico dos últimos 24 h para a equipe. Ele mostra
  horários de queda, tentativas de reconexão, tipo de conexão, versão do
  navegador e do sistema — e **não inclui o conteúdo das suas mensagens**.
- 🔐 **Só por OMEMO:** o relatório vai como arquivo anexo cifrado. Se a conexão
  ou o OMEMO não estiverem disponíveis, o chat oferece baixar o arquivo em vez
  de enviar qualquer coisa em claro.
- 📥 **Onde encontrar:** em **Configurações → Sobre → Diagnóstico de conexão**,
  ou no link **Diagnóstico** ao lado da versão, na tela de login. Dá para baixar
  o arquivo mesmo sem estar conectado.
- 🏷️ **Nome fácil de achar:** o arquivo chega como
  `isacloud-web-v15.30-data-hora.json`, com a versão e o horário no nome.

### v15-29 — 17/11/2026

- 🎞️ **Figurinhas em GIF:** agora dá para enviar, receber e salvar figurinhas
  animadas. Elas aparecem sem balão, no mesmo tamanho das outras, e animam em loop.
- 🔗 **Importe seus GIFs:** no seletor de figurinhas, dá para escolher um arquivo
  GIF ou colar o link direto de um GIF da internet, conferir a prévia e enviar.
- 💾 **Salvar mantém a animação:** salvar uma figurinha GIF recebida e reenviar
  continua animando. Suas figurinhas PNG antigas continuam iguais.

### v15-28 — 16/11/2026

- 📝 **Notas para si mesmo:** agora existe um contato no topo de Contatos para
  você mandar mensagens para si mesmo. A conversa aparece nos recentes depois da
  primeira nota.
- ⌨️ **ESC fecha a conversa:** com o cursor na caixa de mensagem, ESC esconde a
  conversa sem sair de grupos ou canais. A área vazia mostra o balão, a versão e
  o aviso de criptografia, e é a página inicial do isaCloud.
- 🔐 **Login ao fechar o navegador:** o isaCloud pede login de novo quando você
  fecha o navegador. Suas conversas, chaves OMEMO e configurações continuam
  guardadas em cada conta.

### v15-27 — 16/11/2026

- 🔌 **Mensagens não se perdem quando a conexão oscila:** o que você digita
  durante a reconexão fica na fila e sai sozinho quando a conexão volta. Se
  algo não chegou a sair, o chat tenta de novo.
- 🟢 **Aviso discreto e reconexão mais rápida:** em vez de um popup de erro, a
  conversa mostra "Reconectando…" (legível no tema escuro) e volta sozinha ao
  trocar de rede, acordar o computador ou retornar para a aba.
- 🇧🇷 **Textos em português** nos avisos de falha de envio e nos botões de
  reenviar/descartar.

### v15-26 — 14/11/2026

- 🔤 **Contatos em ordem alfabética:** a lista agora ignora maiúsculas e acentos
  e não muda de lugar quando alguém fica online. Muito mais fácil de achar quem
  você procura.

### v15-25 — 14/11/2026

- 💬 **Conversas recentes mais limpas:** canais sem nenhuma mensagem não ocupam
  mais a lista. Sobra espaço para quem realmente conversou.

### v15-24 — 14/11/2026

- 📜 **Histórico sem pulinhos:** ao abrir uma conversa longa, as mensagens
  ficam no lugar durante o carregamento, com um botão para trazer as anteriores.

### v15-23 — 14/11/2026

- ⚡ **A conversa acompanha o presente:** a lista de mensagens segue a mensagem
  mais nova, e reações antigas não bagunçam mais a janela.

### v15-22 — 13/11/2026

- 🪞 **Suas mensagens, fáceis de achar:** o que você enviou ganha um fundo
  cinza-claro para bater o olho e saber quem falou.

### v15-21 — 13/11/2026

- 📝 **Texto do jeito que você escreveu:** as linhas em branco entre parágrafos
  continuam aparecendo nas mensagens.

### v15-20 — 13/11/2026

- 🔐 **Grupos privados de verdade:** "Adicionar grupo" cria um grupo fechado,
  com conversa cifrada e cadeado certo no painel de cada participante.

### v15-19 — 13/11/2026

- 🏷️ **O isaCloud se apresenta direitinho:** o chat passa a usar o nome
  isaCloudWeb no XMPP, mantendo suas conversas organizadas.

### v15-18 — 13/11/2026

- ✨ **Atualização sem espera:** o aviso de nova versão gira no clique e
  recarrega o chat em poucos segundos.

### v15-17 — 13/11/2026

- 🔔 **Aviso de nova versão:** quando uma atualização chega, aparece um ícone
  ao lado da engrenagem. Um clique e você está na versão nova.

### v15-16 — 13/11/2026

- 🇧🇷 **Menu das mensagens em português:** Responder, Reagir, Citar, Retirar e
  Moderar — cada coisa no seu lugar.

### v15-15 — 13/11/2026

- 🧩 **Figurinhas:** envie, receba, salve e crie suas próprias figurinhas, com
  biblioteca e editor.

### v15-14 — 13/11/2026

- 🎨 **Cores no lugar certo:** os rótulos CANAIS e GRUPOS mantêm suas cores no
  menu de contatos.

### v15-13 — 13/11/2026

- 🪟 **Conversa flutuante:** cartões mais bonitos, modais modernas, grupos e
  canais separados, busca de canais, menções legíveis e logout sem surpresas.

### v15-12 — 13/11/2026

- 🚀 **A lista de conversas é oficial:** chats, grupos e canais agora vivem
  juntos na versão principal, e os convites repetidos ficaram para trás.

### v15-11 — 13/11/2026

- 🧵 **Acabamento caprichado:** a coluna de participantes termina alinhada e
  arredondada na altura da caixa de mensagem.

### v15-10 — 13/11/2026

- 👥 **Participantes no mesmo estilo:** status no cantinho do avatar, etiquetas
  em pílula e uma coluna mais confortável para ver quem está no grupo ou canal.

### v15-9 — 13/11/2026

- 📱 **Lista mais confortável:** lateral mais larga, margens melhores e selos de
  grupo e canal no cantinho do avatar.

### v15-8 — 13/11/2026

- 💬 **Chega a lista única de conversas:** chats, grupos e canais juntos, com
  filtros, selos, prévia da última mensagem, não lidas e horário.

### v15-7 — 13/11/2026

- 🎈 **Login mais limpo:** a tela de entrada ficou fora dos cartões, com um
  visual mais leve e direto.

### v15-6 — 13/11/2026

- ✨ **Cara nova:** cartões flutuantes, cantos arredondados, sombras e botão de
  enviar redondo. No celular, a conversa continua de ponta a ponta.

### v15-5 — 12/11/2026

- 🔔 **Aviso de mensagem protegida mais confiável:** erros antigos de
  criptografia não somem mais da contagem.

### v15-4 — 12/11/2026

- 🔐 **Um aviso só, sem susto:** quando uma mensagem antiga não pode ser aberta
  neste navegador, aparece um aviso discreto por conversa, com botão "Entendi".

### v15-3 — 12/11/2026

- 🛡️ **Mais privacidade e conforto:** conversas guardadas no navegador,
  apelido automático nos canais, visual mais limpo e menos avisos chatos em
  outros aplicativos.

### v15-2 — 12/11/2026

- 🎈 **Login com a nossa cara:** balão do isaCloud centralizado e rodapé
  mostrando a versão do Converse.

### v15-1 — 12/11/2026

- 🌤️ **Primeiros ajustes:** o balão do isaCloud aparece direitinho no topo e o
  build fica mais limpo para publicar.

### v15-0 — 12/11/2026

- 🎉 **Nasce o isaCloud Web:** a marca da comunidade, temas claro e escuro,
  balão, menu, rodapé e o primeiro build em <https://chat.isacloud.cc>.

> Curiosidade: este resumo é para todo mundo; os detalhes técnicos de cada
> versão ficam no [CHANGELOG.md](CHANGELOG.md).

#!/usr/bin/env bash
# Reduced test suite for the isaCloud fork: the specs that cover what the fork
# changes (OMEMO, the undecryptable notice, the message hooks it shares with
# reactions and retractions, composer panels, MUC nicknames and errors).
# Much faster than the full suite; run `make check` before bigger merges.
#
#   ./isacloud/test.sh              # builds (npm run dev), then runs the specs
#   ./isacloud/test.sh --sem-build  # reuses the current dist/ build
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--sem-build" ]]; then
    npm run dev
fi

# The changelog JSON is generated from the release data; a stale copy must fail
# the reduced suite instead of shipping old news.
node scripts/generate-changelog-json.mjs --check

MAIN_SPECS=(
    src/web/plugins/omemo-views/tests/
    src/web/plugins/reactions-views/tests/
    src/web/plugins/recent-list/tests/recent-list.js
    src/web/plugins/rosterview/tests/
    src/web/plugins/chatview/tests/composer-panels.js
    src/web/plugins/chatview/tests/dropdown-position.js # isaCloud: menu da mensagem fora do composer
    src/web/plugins/chatview/tests/attachment-menu.js # isaCloud: anexos em pt_BR
    src/web/plugins/chatview/tests/markers.js
    src/web/plugins/chatview/tests/messages.js
    src/web/plugins/chatview/tests/message-form.js # isaCloud: Shift+Enter quebra linha no compositor
    src/web/plugins/chatview/tests/message-window.js # isaCloud: janela da lista de mensagens
    src/web/plugins/chatview/tests/retractions.js
    src/web/plugins/muc-views/tests/composer-panels.js
    src/web/plugins/muc-views/tests/muc.js
    src/web/plugins/muc-views/tests/muc-list-modal.js
    src/web/plugins/modal/tests/toast-action.js # isaCloud: ação no toast
    src/web/plugins/profile/tests/
    src/web/plugins/roomslist/tests/
    src/web/plugins/isacloud-changelog/tests/ # isaCloud: novidades na lista
    src/web/plugins/isacloud-stickers/tests/ # isaCloud: figurinhas
    src/web/plugins/isacloud-conference/tests/ # isaCloud: vídeo conferência
    src/web/plugins/isacloud-polls/tests/ # isaCloud: enquetes (Fluux)
    src/web/plugins/isacloud-replies/tests/ # isaCloud: respostas (XEP-0461)
    src/web/plugins/isacloud-update/tests/ # isaCloud: aviso de nova versão
    src/web/plugins/chatview/tests/replies.js # isaCloud: núcleo das respostas
    src/web/plugins/muc-views/tests/replies.js # isaCloud: respostas em grupo
    src/web/plugins/muc-views/tests/muc-messages.js
    src/web/plugins/muc-views/tests/nickname.js
    src/web/plugins/muc-views/tests/add-private-group.js # isaCloud: criar grupo privado
    src/web/plugins/muc-views/tests/muc-add-modal.js
    src/web/plugins/muc-views/tests/occupant-sidebar.js # isaCloud: painel do participante
    src/web/plugins/muc-views/tests/muc-private-messages.js
    src/web/plugins/muc-views/tests/retractions.js
    src/web/plugins/time-views/tests/entity-time-alert.js
    src/web/shared/modals/tests/image-modal.js # isaCloud: visualizador de imagem com zoom e arrasto
    src/web/apps/social/tests/compose-rich.js # isaCloud: mesmo editor Lexical do compositor
)

HEADLESS_SPECS=(
    src/headless/plugins/muc/tests/messages.js
    src/headless/plugins/muc/tests/muc.js
    src/headless/plugins/reactions/tests/
    src/headless/shared/connection/tests/resource.js # isaCloud: resource isaCloudWeb-
    src/headless/plugins/chat/tests/mam-dedupe.js # isaCloud: dedupe de replay de MAM
    src/headless/plugins/muc/tests/mam-dedupe.js # isaCloud: dedupe de replay de MAM em sala
    src/headless/tests/reconnection.js # isaCloud: troca de transporte e volta ao WebSocket
    src/headless/tests/diagnostics.js # isaCloud: eventos de diagnóstico da conexão
)

npx vitest run --project main "${MAIN_SPECS[@]}"
npx vitest run --project headless "${HEADLESS_SPECS[@]}"
npm run types:check

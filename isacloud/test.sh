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

MAIN_SPECS=(
    src/plugins/omemo-views/tests/
    src/plugins/reactions-views/tests/
    src/plugins/recent-list/tests/recent-list.js
    src/plugins/rosterview/tests/
    src/plugins/chatview/tests/composer-panels.js
    src/plugins/chatview/tests/markers.js
    src/plugins/chatview/tests/messages.js
    src/plugins/chatview/tests/retractions.js
    src/plugins/muc-views/tests/composer-panels.js
    src/plugins/muc-views/tests/muc.js
    src/plugins/muc-views/tests/muc-list-modal.js
    src/plugins/profile/tests/
    src/plugins/roomslist/tests/
    src/plugins/isacloud-stickers/tests/ # isaCloud: figurinhas
    src/plugins/isacloud-update/tests/ # isaCloud: aviso de nova versão
    src/plugins/muc-views/tests/muc-messages.js
    src/plugins/muc-views/tests/nickname.js
    src/plugins/muc-views/tests/add-private-group.js # isaCloud: criar grupo privado
    src/plugins/muc-views/tests/muc-add-modal.js
    src/plugins/muc-views/tests/occupant-sidebar.js # isaCloud: painel do participante
    src/plugins/muc-views/tests/muc-private-messages.js
    src/plugins/muc-views/tests/retractions.js
    src/plugins/time-views/tests/entity-time-alert.js
)

HEADLESS_SPECS=(
    src/headless/plugins/muc/tests/messages.js
    src/headless/plugins/muc/tests/muc.js
    src/headless/plugins/reactions/tests/
    src/headless/shared/connection/tests/resource.js # isaCloud: resource isaCloudWeb-
)

npx vitest run --project main "${MAIN_SPECS[@]}"
npx vitest run --project headless "${HEADLESS_SPECS[@]}"
npm run types:check

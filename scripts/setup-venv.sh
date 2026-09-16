#!/usr/bin/env bash
# Recreate a project-local Node environment in .venv (Python-venv style).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="$(tr -d '[:space:]' < "$ROOT/.nvmrc")"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm not found at $NVM_DIR. Install nvm first." >&2
  exit 1
fi

# nvm is a shell function, not a binary.
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

NODE_BIN="$(command -v node)"
NODE_PREFIX="$(cd "$(dirname "$NODE_BIN")/.." && pwd)"
VENV="$ROOT/.venv"

rm -rf "$VENV"
mkdir -p "$VENV/bin"

for tool in node npm npx corepack; do
  if [[ -x "$NODE_PREFIX/bin/$tool" ]]; then
    ln -s "$NODE_PREFIX/bin/$tool" "$VENV/bin/$tool"
  fi
done

cat > "$VENV/bin/activate" <<EOF
# Usage: source .venv/bin/activate
deactivate () {
    if [ -n "\${_OLD_VIRTUAL_PATH:-}" ]; then
        PATH="\$_OLD_VIRTUAL_PATH"
        export PATH
        unset _OLD_VIRTUAL_PATH
    fi
    if [ -n "\${_OLD_VIRTUAL_PS1:-}" ]; then
        PS1="\$_OLD_VIRTUAL_PS1"
        export PS1
        unset _OLD_VIRTUAL_PS1
    fi
    unset VIRTUAL_ENV
    unset VIRTUAL_ENV_PROMPT
    unset -f deactivate 2>/dev/null || true
    hash -r 2>/dev/null || true
}

VIRTUAL_ENV="$VENV"
export VIRTUAL_ENV
VIRTUAL_ENV_PROMPT="class-organizer"
export VIRTUAL_ENV_PROMPT

_OLD_VIRTUAL_PATH="\$PATH"
PATH="\$VIRTUAL_ENV/bin:\$PATH"
export PATH

if [ -z "\${VIRTUAL_ENV_DISABLE_PROMPT:-}" ]; then
    _OLD_VIRTUAL_PS1="\${PS1:-}"
    PS1="(\$VIRTUAL_ENV_PROMPT) \${PS1:-}"
    export PS1
fi

hash -r 2>/dev/null || true
EOF

echo "Node $( "$VENV/bin/node" -v ) is ready."
echo "Activate with: source .venv/bin/activate"

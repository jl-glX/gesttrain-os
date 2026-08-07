#!/bin/sh
set -eu

CONFIG_FILE=${UMBRAVIA_UPDATE_ENV_FILE:-/etc/umbravia-forge/update.env}

if [ ! -r "$CONFIG_FILE" ]; then
  printf 'ERR no se puede leer la configuracion de actualizacion: %s\n' "$CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CONFIG_FILE"

: "${UMBRAVIA_REPOSITORY_URL:=https://github.com/jl-glX/umbravia-forge.git}"
: "${UMBRAVIA_UPDATE_BRANCH:=main}"
: "${UMBRAVIA_SOURCE_DIR:=/var/lib/umbravia-forge-updater/source}"
: "${UMBRAVIA_RELEASES_DIR:=/opt/umbravia-forge/releases}"
: "${UMBRAVIA_CURRENT_LINK:=/opt/umbravia-forge/current}"
: "${UMBRAVIA_APP_ENV_FILE:=/etc/umbravia-forge/umbravia-forge.env}"
: "${UMBRAVIA_BUILD_USER:=umbravia-updater}"
: "${UMBRAVIA_APP_USER:=umbravia}"
: "${UMBRAVIA_APP_GROUP:=umbravia}"
: "${UMBRAVIA_APP_SERVICE:=umbravia-forge.service}"
: "${UMBRAVIA_LOCAL_HEALTH_URL:=http://127.0.0.1:3001/api/health}"
: "${UMBRAVIA_PUBLIC_HEALTH_URL:=}"
: "${UMBRAVIA_HEALTH_ATTEMPTS:=15}"
: "${UMBRAVIA_HEALTH_DELAY_SECONDS:=2}"
: "${UMBRAVIA_UPDATE_LOCK:=/run/lock/umbravia-forge-update.lock}"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"
}

fail() {
  log "ERR $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "falta el comando requerido: $1"
}

run_as() {
  user=$1
  shift
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u "$user" -- "$@"
  else
    [ "$(id -un)" = "$user" ] || fail "se necesita root para ejecutar como $user"
    "$@"
  fi
}

health_check() {
  url=$1
  attempts=$UMBRAVIA_HEALTH_ATTEMPTS
  while [ "$attempts" -gt 0 ]; do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      return 0
    fi
    attempts=$((attempts - 1))
    [ "$attempts" -gt 0 ] && sleep "$UMBRAVIA_HEALTH_DELAY_SECONDS"
  done
  return 1
}

[ "$(id -u)" -eq 0 ] || fail "el actualizador debe ejecutarse como root"

for command_name in curl flock git install ln mv node npm readlink runuser systemctl; do
  require_command "$command_name"
done

id "$UMBRAVIA_BUILD_USER" >/dev/null 2>&1 || fail "usuario de construccion inexistente: $UMBRAVIA_BUILD_USER"
id "$UMBRAVIA_APP_USER" >/dev/null 2>&1 || fail "usuario de aplicacion inexistente: $UMBRAVIA_APP_USER"
getent group "$UMBRAVIA_APP_GROUP" >/dev/null 2>&1 || fail "grupo de aplicacion inexistente: $UMBRAVIA_APP_GROUP"
[ -r "$UMBRAVIA_APP_ENV_FILE" ] || fail "archivo de entorno inaccesible: $UMBRAVIA_APP_ENV_FILE"
[ -n "${VITE_TURNSTILE_SITE_KEY:-}" ] || fail "VITE_TURNSTILE_SITE_KEY no esta configurada"

install -d -o root -g root -m 0755 "$(dirname "$UMBRAVIA_UPDATE_LOCK")"
exec 9>"$UMBRAVIA_UPDATE_LOCK"
if ! flock -n 9; then
  log "otra comprobacion de actualizaciones sigue activa; se omite esta ejecucion"
  exit 0
fi

source_parent=$(dirname "$UMBRAVIA_SOURCE_DIR")
install -d -o "$UMBRAVIA_BUILD_USER" -g "$UMBRAVIA_BUILD_USER" -m 0750 "$source_parent"

if [ ! -d "$UMBRAVIA_SOURCE_DIR/.git" ]; then
  log "creando la copia de actualizacion"
  run_as "$UMBRAVIA_BUILD_USER" git clone --branch "$UMBRAVIA_UPDATE_BRANCH" --single-branch \
    "$UMBRAVIA_REPOSITORY_URL" "$UMBRAVIA_SOURCE_DIR"
fi

run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" fetch --prune origin "$UMBRAVIA_UPDATE_BRANCH"
remote_commit=$(run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" rev-parse "origin/$UMBRAVIA_UPDATE_BRANCH")

current_target=""
current_commit=""
if [ -L "$UMBRAVIA_CURRENT_LINK" ]; then
  current_target=$(readlink -f "$UMBRAVIA_CURRENT_LINK")
  if [ -r "$current_target/.umbravia-release-commit" ]; then
    current_commit=$(sed -n '1p' "$current_target/.umbravia-release-commit")
  else
    current_commit=$(basename "$current_target")
  fi
fi

if [ "$current_commit" = "$remote_commit" ]; then
  log "sin cambios: $remote_commit ya esta desplegado"
  exit 0
fi

if [ -n "$current_commit" ]; then
  if ! run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" cat-file -e "$current_commit^{commit}" 2>/dev/null; then
    fail "la release activa $current_commit no pertenece al historial disponible; no se actualiza automaticamente"
  fi
  if ! run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" merge-base --is-ancestor "$current_commit" "$remote_commit"; then
    fail "origin/$UMBRAVIA_UPDATE_BRANCH no avanza desde $current_commit; se rechaza una regresion o historia divergente"
  fi
fi

release_dir="$UMBRAVIA_RELEASES_DIR/$remote_commit"
if [ -d "$release_dir" ]; then
  fail "la release de destino ya existe sin estar activa: $release_dir"
fi

build_root=$(mktemp -d "/var/lib/umbravia-forge-updater/build-${remote_commit}.XXXXXX")
case "$build_root" in
  /var/lib/umbravia-forge-updater/build-*) ;;
  *) fail "ruta temporal inesperada: $build_root" ;;
esac
worktree_added=0
cleanup() {
  if [ "$worktree_added" -eq 1 ]; then
    run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" worktree remove --force "$build_root" >/dev/null 2>&1 || true
  fi
  if [ -d "$build_root" ]; then
    rm -rf -- "$build_root"
  fi
}
trap cleanup EXIT HUP INT TERM
chown "$UMBRAVIA_BUILD_USER:$UMBRAVIA_BUILD_USER" "$build_root"

log "construyendo $remote_commit en un arbol aislado"
run_as "$UMBRAVIA_BUILD_USER" git -C "$UMBRAVIA_SOURCE_DIR" worktree add --detach "$build_root" "$remote_commit"
worktree_added=1
run_as "$UMBRAVIA_BUILD_USER" sh -c '
  set -eu
  cd "$1"
  npm ci --audit=false --fund=false
  VITE_TURNSTILE_SITE_KEY=$2 npm run deploy:package
' sh "$build_root" "$VITE_TURNSTILE_SITE_KEY"

install -d -o root -g root -m 0755 "$UMBRAVIA_RELEASES_DIR"
install -d -o "$UMBRAVIA_APP_USER" -g "$UMBRAVIA_APP_GROUP" -m 0750 "$release_dir"
cp -a "$build_root/.deployment-package/." "$release_dir/"
chown -R "$UMBRAVIA_APP_USER:$UMBRAVIA_APP_GROUP" "$release_dir"
run_as "$UMBRAVIA_APP_USER" sh -c '
  set -eu
  cd "$1"
  npm ci --omit=dev --audit=false --fund=false
' sh "$release_dir"
printf '%s\n' "$remote_commit" >"$release_dir/.umbravia-release-commit"
chmod 0755 "$release_dir/deploy/check-linux-readiness.sh"
chown -R root:"$UMBRAVIA_APP_GROUP" "$release_dir"
chmod -R o-rwx "$release_dir"

UMBRAVIA_ENV_FILE="$UMBRAVIA_APP_ENV_FILE" "$release_dir/deploy/check-linux-readiness.sh"

next_link="${UMBRAVIA_CURRENT_LINK}.next"
rm -f -- "$next_link"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$UMBRAVIA_CURRENT_LINK"

log "activando $remote_commit"
if ! systemctl restart "$UMBRAVIA_APP_SERVICE" || ! health_check "$UMBRAVIA_LOCAL_HEALTH_URL"; then
  log "ERR la nueva release no supera la salud local; restaurando la anterior" >&2
  if [ -n "$current_target" ] && [ -d "$current_target" ]; then
    ln -s "$current_target" "$next_link"
    mv -Tf "$next_link" "$UMBRAVIA_CURRENT_LINK"
    systemctl restart "$UMBRAVIA_APP_SERVICE" || true
  fi
  exit 1
fi

if [ -n "$UMBRAVIA_PUBLIC_HEALTH_URL" ] && ! health_check "$UMBRAVIA_PUBLIC_HEALTH_URL"; then
  log "ERR la nueva release no supera la salud publica; restaurando la anterior" >&2
  if [ -n "$current_target" ] && [ -d "$current_target" ]; then
    ln -s "$current_target" "$next_link"
    mv -Tf "$next_link" "$UMBRAVIA_CURRENT_LINK"
    systemctl restart "$UMBRAVIA_APP_SERVICE" || true
  fi
  exit 1
fi

log "release $remote_commit desplegada y saludable"

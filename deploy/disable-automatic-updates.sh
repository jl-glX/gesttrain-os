#!/bin/sh
set -eu

UPDATER_ROOT=/var/lib/umbravia-forge-updater
UPDATE_LOCK=/run/lock/umbravia-forge-update.lock
UPDATE_SERVICE=/etc/systemd/system/umbravia-update.service
UPDATE_TIMER=/etc/systemd/system/umbravia-update.timer
CURRENT_RELEASE=/opt/umbravia-forge/current

if [ "$(id -u)" -ne 0 ]; then
  printf 'ERR esta limpieza debe ejecutarse como root\n' >&2
  exit 1
fi

case "$UPDATER_ROOT" in
  /var/lib/umbravia-forge-updater) ;;
  *)
    printf 'ERR ruta del actualizador inesperada: %s\n' "$UPDATER_ROOT" >&2
    exit 1
    ;;
esac

active_release=$(readlink -f "$CURRENT_RELEASE" 2>/dev/null || true)
if [ -z "$active_release" ] || [ ! -d "$active_release" ]; then
  printf 'ERR no se ha encontrado una release activa; no se limpia nada\n' >&2
  exit 1
fi

printf 'Release activa preservada: %s\n' "$active_release"

systemctl disable --now umbravia-update.timer 2>/dev/null || true
systemctl stop umbravia-update.service 2>/dev/null || true

rm -f -- "$UPDATE_SERVICE" "$UPDATE_TIMER" "$UPDATE_LOCK"
if [ -d "$UPDATER_ROOT" ]; then
  rm -rf -- "$UPDATER_ROOT"
fi

systemctl daemon-reload
systemctl reset-failed umbravia-update.service umbravia-update.timer 2>/dev/null || true

if ! systemctl is-active --quiet umbravia-forge.service; then
  printf 'ERR la aplicacion activa no esta en ejecucion\n' >&2
  exit 1
fi

printf 'Actualizador automatico retirado. Umbravia Forge sigue activa.\n'

#!/usr/bin/env bash
#
# Cluster PostgreSQL local au projet — sans Docker, sans service système.
#
# Les données vivent dans ./.pgdata, le serveur écoute sur un port décalé et
# n'est jamais enregistré auprès de launchd. Rien n'est modifié en dehors du
# répertoire du projet ; `destroy` remet la machine dans son état initial.
#
#   ./scripts/pg.sh start | stop | status | psql | destroy
#
# Pour utiliser un serveur PostgreSQL déjà en place plutôt que ce cluster,
# ignorez ce script et pointez simplement DATABASE_URL dessus.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${RYLA_PGDATA:-$ROOT/.pgdata}"
PORT="${RYLA_PGPORT:-54329}"
DBNAME=ryla
OWNER=ryla
LOG="$DATA/server.log"

# ---------------------------------------------------------------------------
# Localisation des binaires PostgreSQL
# ---------------------------------------------------------------------------
find_pgbin() {
  if [[ -n "${RYLA_PGBIN:-}" ]]; then
    echo "$RYLA_PGBIN"
    return 0
  fi
  if command -v brew >/dev/null 2>&1; then
    for formula in postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
      local prefix
      prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
      if [[ -n "$prefix" && -x "$prefix/bin/pg_ctl" ]]; then
        echo "$prefix/bin"
        return 0
      fi
    done
  fi
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return 0
  fi
  echo "Aucune installation PostgreSQL trouvée." >&2
  echo "Installez-la (brew install postgresql@16) ou définissez RYLA_PGBIN." >&2
  return 1
}

PGBIN="$(find_pgbin)"

is_running() {
  "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1
}

cmd_start() {
  if [[ ! -d "$DATA" ]]; then
    echo "• Création du cluster dans $DATA"
    # --auth=trust : le serveur n'écoute que sur la boucle locale, sur un port
    # dédié, pour du développement. Ne reproduisez pas ça ailleurs.
    "$PGBIN/initdb" -D "$DATA" -U "$OWNER" --auth=trust --encoding=UTF8 \
      --locale=C >/dev/null
  fi

  if is_running; then
    echo "• Serveur déjà démarré (port $PORT)"
  else
    echo "• Démarrage du serveur sur le port $PORT"
    "$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" \
      -o "-p $PORT -k '$DATA' -c listen_addresses=localhost" \
      -w start >/dev/null
  fi

  if ! "$PGBIN/psql" -h localhost -p "$PORT" -U "$OWNER" -d postgres -tAc \
      "select 1 from pg_database where datname='$DBNAME'" | grep -q 1; then
    echo "• Création de la base $DBNAME"
    "$PGBIN/createdb" -h localhost -p "$PORT" -U "$OWNER" "$DBNAME"
  fi

  echo "✓ PostgreSQL prêt sur postgres://$OWNER@localhost:$PORT/$DBNAME"
}

cmd_stop() {
  if is_running; then
    "$PGBIN/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null
    echo "✓ Serveur arrêté"
  else
    echo "• Serveur déjà arrêté"
  fi
}

cmd_status() {
  if is_running; then
    echo "✓ En cours d'exécution (port $PORT, données dans $DATA)"
  else
    echo "✗ Arrêté"
    exit 1
  fi
}

cmd_psql() {
  shift || true
  exec "$PGBIN/psql" -h localhost -p "$PORT" -U "$OWNER" -d "$DBNAME" "$@"
}

cmd_destroy() {
  is_running && "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null || true
  rm -rf "$DATA"
  echo "✓ Cluster supprimé ($DATA)"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  psql)    cmd_psql "$@" ;;
  destroy) cmd_destroy ;;
  *)
    echo "Usage: $0 {start|stop|status|psql|destroy}" >&2
    exit 1
    ;;
esac

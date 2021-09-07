#!/bin/bash
SCRIPT_NAME="DPoSPool"

cd "$(cd -P -- "$(dirname -- "$0")" && pwd -P)"
. "$(pwd)/shared.sh"
. "$(pwd)/env.sh"

if [ ! -f "$(pwd)/dpospool.js" ]; then
  echo "Error: $SCRIPT_NAME installation was not found. Exiting."
  exit 1
fi

if [ "\$USER" == "root" ]; then
  echo "Error: $SCRIPT_NAME should not be run be as root. Exiting."
  exit 1
fi

UNAME=$(uname)
POOL_CONFIG=config.json

LOGS_DIR="$(pwd)/logs"
PIDS_DIR="$(pwd)/pids"

LOG_DB_FILE="$LOGS_DIR/pgsql.log"
LOG_APP_FILE="$LOGS_DIR/app.log"
LOG_CRON_FILE="$LOGS_DIR/cron.log"

PID_APP_FILE="$PIDS_DIR/dpospool.pid"
PID_DB_FILE="$PIDS_DIR/pgsql.pid"

DB_NAME="$(grep "dbname" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_USER="$(grep "dbuser" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_PASS="$(grep "dbpass" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_PORT="$(grep "dbport" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_DATA="$(pwd)/pgsql/data"
DB_CONFIG="$(pwd)/pgsql/pgsql.conf"

CMDS=("node" "crontab" "curl" "pm2" "psql" "createdb" "createuser" "dropdb" "dropuser")
################################################################################

#Database
create_user() {
  dropuser --if-exists "$DB_USER" -p "$DB_PORT" &> /dev/null
  createuser --createdb "$DB_USER" -p "$DB_PORT" &> /dev/null
  psql -qd postgres -c "ALTER USER "$DB_USER" WITH PASSWORD '$DB_PASS';" -p "$DB_PORT" &> /dev/null
  if [ $? != 0 ]; then
    echo "X Failed to create $SCRIPT_NAME database user."
    echo "Error: $ERR"
    exit 1
  else
    echo "√ $SCRIPT_NAME database user created successfully."
  fi
}
create_database() {
  dropdb --if-exists "$DB_NAME" -p "$DB_PORT" &> /dev/null
  createdb "$DB_NAME" -p "$DB_PORT" &> /dev/null
  psql -U "$DB_USER" -d "$DB_NAME" -f "$(pwd)/sql/database_scheme.sql" -p "$DB_PORT" &> /dev/null
  if [ $? != 0 ]; then
    echo "X Failed to create $SCRIPT_NAME database."
    exit 1
  else
    echo "√ $SCRIPT_NAME database created successfully."
  fi
}
start_postgresql() {
  if [ -f $PID_DB_FILE ]; then
    echo "√ $SCRIPT_NAME database is running."
  else
    pg_ctl -o "-F -p $DB_PORT --config-file=$DB_CONFIG" -D "$DB_DATA" -l "$LOG_DB_FILE" start &> /dev/null
    sleep 1
    if [ $? != 0 ]; then
      echo "X Failed to start $SCRIPT_NAME database."
      exit 1
    else
      echo "√ $SCRIPT_NAME database started successfully."
    fi
  fi
}
stop_postgresql() {
  if [ -f $PID_DB_FILE ]; then
    pg_ctl -o "-F -p $DB_PORT --config-file=$DB_CONFIG" -D "$DB_DATA" -l "$LOG_DB_FILE" stop &> /dev/null
    sleep 1
    if [ $? != 0 ]; then
      echo "X Failed to stopped $SCRIPT_NAME database."
      exit 1
      #Add kill postgres process if not stoped get pid from file
    else
      echo "√ $SCRIPT_NAME database stopped successfully."
    fi
  else
    echo "√ $SCRIPT_NAME database is not running."
  fi
}
check_db_status() {
  if [ -f "$PID_DB_FILE" ]; then
    PID="$(cat "$PID_DB_FILE")"
  fi
  if [ ! -z "$PID" ]; then
    ps -p "$PID" > /dev/null 2>&1
    STATUS=$?
  else
    STATUS=1
  fi

  if [ -f $PID_DB_FILE ] && [ ! -z "$PID" ] && [ $STATUS == 0 ]; then
    echo "√ $SCRIPT_NAME database is running as PID: $PID"
    return 0
  else
    echo "X $SCRIPT_NAME database is not running."
    return 1
  fi
}
backup_db() {
  pg_dump -p $DB_PORT $DB_NAME > "$(pwd)/sql/"$DB_NAME"_dump.sql"
  sleep 1
  if [ $? != 0 ]; then
    echo "X Failed to backup $SCRIPT_NAME database."
    exit 1
  else
    echo "√ $SCRIPT_NAME database backup successfully."
  fi
}
restore_db() {
  dropdb --if-exists "$DB_NAME" -p "$DB_PORT" &> /dev/null
  createdb "$DB_NAME" -p "$DB_PORT" &> /dev/null
  psql -U "$DB_USER" -d "$DB_NAME" -f "$(pwd)/sql/"$DB_NAME"_dump.sql" -p "$DB_PORT" &> /dev/null
  if [ $? != 0 ]; then
    echo "X Failed to restore $SCRIPT_NAME database."
    exit 1
  else
    echo "√ $SCRIPT_NAME database restore successfully."
  fi
}
reset_db() {
  stop_pool
  stop_postgresql
  sleep 2
  rm -rf $DB_DATA
  echo "√ Remove old db data."
  sleep 2
  pg_ctl initdb -D $DB_DATA &> /dev/null
  sleep 2
  echo "√ Create new db data"
  start_postgresql
  sleep 1
  create_user
  create_database
}
update_db() {
  psql -U "$DB_USER" -d "$DB_NAME" -f "$(pwd)/sql/update_scheme.sql" -p "$DB_PORT"
}

#Node
autostart_pool() {
  local cmd="crontab"

  command -v "$cmd" &> /dev/null

  if [ $? != 0 ]; then
    echo "X Failed to execute crontab."
    return 1
  fi

  crontab=$($cmd -l 2> /dev/null | sed '/pool\.sh start/d' 2> /dev/null)

  crontab=$(cat <<-EOF
	$crontab
	@reboot $(command -v "bash") $(pwd)/pool.sh start > $LOG_CRON_FILE 2>&1
	EOF
  )

  printf "$crontab\n" | $cmd - &> /dev/null

  if [ $? != 0 ]; then
    echo "X Failed to update crontab."
    return 1
  else
    echo "√ Crontab updated successfully."
    return 0
  fi
}
start_pool() {
  if check_node_status == 1 &> /dev/null; then
    check_node_status
    exit 1
  else
    pm2 start dpospool.js -n $SCRIPT_NAME -l $LOG_APP_FILE &> /dev/null;
    if [ $? == 0 ]; then
      echo "√ $SCRIPT_NAME started successfully."
      sleep 3
      check_node_status
    else
      echo "X Failed to start $SCRIPT_NAME."
    fi
  fi
}
stop_pool() {
  if check_node_status != 1 &> /dev/null; then
    pm2 stop $SCRIPT_NAME &> /dev/null;
    if [ $? !=  0 ]; then
      echo "X Failed to stop $SCRIPT_NAME."
    else
      echo "√ $SCRIPT_NAME stopped successfully."
    fi
  else
    echo "√ $SCRIPT_NAME is not running."
  fi
}
reload_pool() {
  pm2 restart $SCRIPT_NAME &> /dev/null;
  if [ $? == 0 ]; then
    echo "√ $SCRIPT_NAME reload successfully."
    check_node_status
  else
    echo "X Failed to reload $SCRIPT_NAME."
  fi
}
check_node_status() {
  PID=$(pm2 pid $SCRIPT_NAME)
  if [ $PID != 0 ]; then
    echo "√ $SCRIPT_NAME is running as PID: $PID"
    return 0
  else
    echo "X $SCRIPT_NAME is not running."
    return 1
  fi
}
payouts() {
  echo "Start payouts script..."
  node $(pwd)"/libs/payouts.js" 
  sleep 3
  echo "Payouts end."
  exit 1
}

#App
install_pool() {
  echo "#####$SCRIPT_NAME Installation#####"
  echo " * Installation may take several minutes"
  check_cmds CMDS[@]
  echo "√ Check using commands."
  stop_pool &> /dev/null
  stop_postgresql &> /dev/null
  rm -rf $DB_DATA
  echo "√ Remove db data if exist."
  pg_ctl initdb -D $DB_DATA &> /dev/null
  sleep 2
  echo "√ Create db data"
  start_postgresql
  sleep 1
  create_user
  create_database
  autostart_pool
  start_pool
  echo " * Installation completed. $SCRIPT_NAME started."
}
tail_logs() {
  if [ -f "$LOG_APP_FILE" ]; then
    pm2 logs $SCRIPT_NAME
  fi
}

################################################################################

#Help
help() {
  echo -e "\n ##### Command Options for pool.sh #####\n"
  echo -e "install      - Install $SCRIPT_NAME script"
  echo -e "====="
  echo -e "start        - Start the $SCRIPT_NAME and $SCRIPT_NAME database processes"
  echo -e "stop         - Stop the $SCRIPT_NAME and $SCRIPT_NAME database processes"
  echo -e "reload       - Reload the $SCRIPT_NAME and $SCRIPT_NAME database processes"
  echo -e "status       - Display the status of the PID associated with $SCRIPT_NAME"
  echo -e "payouts      - Payouts to voters"
  echo -e "logs         - Display and tail $SCRIPT_NAME logs"
  echo -e "help         - Displays this message"
  echo -e "====="
  echo -e "start_node   - Start a $SCRIPT_NAME process"
  echo -e "stop_node    - Stop a $SCRIPT_NAME process"
  echo -e "====="
  echo -e "start_db     - Start the $SCRIPT_NAME database"
  echo -e "stop_db      - Stop the $SCRIPT_NAME database"
  echo -e "reset_db     - Re-create the $SCRIPT_NAME database"
  echo -e "backup_db    - Backup $SCRIPT_NAME database to 'sql' folder"
  echo -e "restore_db   - Restore $SCRIPT_NAME database from 'sql' folder(restore db file "$DB_NAME"_dump.sql) \n" 
}

#All commands
case $1 in
	"install")
	  install_pool
	  ;;
	"start_node")
    start_postgresql
	  start_pool
	  ;;
	"start")
    rm $LOGS_DIR/*.log
	  start_postgresql
	  sleep 2
	  start_pool
	  ;;
	"stop_node")
	  stop_pool
	  ;;
	"stop")
	  stop_pool
	  stop_postgresql
	  ;;
	"reload")
    reload_pool
	  ;;
	"start_db")
	  start_postgresql
	  ;;
	"stop_db")
	  stop_postgresql
	  ;;
  "reset_db")
    reset_db
    ;;
  "backup_db")
    start_postgresql
    backup_db
    ;;
  "restore_db")
    stop_pool
    start_postgresql
    restore_db
    start_pool
    ;;
	"status")
	  check_node_status
    check_db_status
	  ;;
  "payouts")
    start_postgresql
    payouts
    ;;
  "update_db")
    update_db
    ;;
	"logs")
	  tail_logs
	  ;;
	"help")
	  help
	  ;;
	*)
  echo "Error: Unrecognized command."
  echo ""
  echo "Available commands are: install|start|stop|reload|logs|status|payouts|help|start_node|stop_node|start_db|stop_db|backup_db|restore_db"
  help
  ;;
esac
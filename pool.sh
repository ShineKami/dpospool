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

LOG_DB_FILE="$LOGS_DIR/pgsql.log"
LOG_APP_FILE="$LOGS_DIR/app.log"
LOG_CRON_FILE="$LOGS_DIR/cron.log"

DB_NAME="$(grep "dbname" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_USER="$(grep "dbuser" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_PASS="$(grep "dbpass" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_PORT="$(grep "dbport" "$POOL_CONFIG" | cut -f 4 -d '"')"
DB_DATA="$(pwd)/pgsql/data"
DB_BACKUP="$(pwd)/pgsql/backup/"$DB_NAME".dump.gz"

PAYOUTS_TIME="$(grep "cron" "$POOL_CONFIG" | cut -f 4 -d '"')"

CMDS=("node" "crontab" "curl" "pm2" "psql" "zcat" "gzip" "createdb" "createuser" "dropdb" "dropuser")
################################################################################

#global
create_user() {
	dropuser --if-exists "$DB_USER" -p "$DB_PORT" &> $LOG_DB_FILE
	createuser --createdb "$DB_USER" -p "$DB_PORT" &> $LOG_DB_FILE
	psql -qd postgres -c "ALTER USER "$DB_USER" WITH PASSWORD '$DB_PASS';" -p "$DB_PORT" &> $LOG_DB_FILE
	if [ $? != 0 ]; then
		echo "X Failed to create $SCRIPT_NAME database user."
		exit 1
	else
		echo "√ $SCRIPT_NAME database user created successfully."
	fi
}
create_database() {
	dropdb --if-exists "$DB_NAME" -p "$DB_PORT" &> $LOG_DB_FILE
	createdb "$DB_NAME" -p "$DB_PORT" &> $LOG_DB_FILE
	psql -U "$DB_USER" -d "$DB_NAME" -f "$(pwd)/pgsql/sql/database_scheme.sql" -p "$DB_PORT" &> $LOG_DB_FILE
	if [ $? != 0 ]; then
		echo "X Failed to create $SCRIPT_NAME database."
		exit 1
	else
		echo "√ $SCRIPT_NAME database created successfully."
	fi
}
check_node_status() {
	PID=$(pm2 pid $SCRIPT_NAME)
	if [[ $PID != "" ]] && [[ $PID != 0 ]]; then
		echo "√ $SCRIPT_NAME node is running as PID: $PID"
		return 1
	else
		echo "X $SCRIPT_NAME node is not running."
		return 0
	fi
}
check_db_status() {
	PID=$(pg_ctl status -D $DB_DATA | grep -oP '\(PID: \K[^\)]+')
	if [ $? == 0 ]; then
		echo "√ $SCRIPT_NAME database is running as PID: $PID"
		return 1
	else
		echo "X $SCRIPT_NAME database is not running."
		return 0
	fi
}

#DB
start_postgresql() {
	RES=$(check_db_status)
	if [ $? == 1 ]; then
		echo $RES
	else
		pg_ctl -o "-F -p $DB_PORT" -D "$DB_DATA" -l "$LOG_DB_FILE" start &> /dev/null
		if [ $? == 0 ]; then
			echo "√ $SCRIPT_NAME database started successfully."
			check_db_status
		else
			echo "X Failed to start $SCRIPT_NAME database."
		fi
	fi
}
stop_postgresql() {
	RES=$(check_db_status)
	if [ $? != 1 ]; then
		echo $RES
	else
		pg_ctl -o "-F -p $DB_PORT" -D "$DB_DATA" -l "$LOG_DB_FILE" stop &> /dev/null
		if [ $? != 0 ]; then
			echo "X Failed to stopped $SCRIPT_NAME database."
			exit 1
		else
			echo "√ $SCRIPT_NAME database stopped successfully."
		fi
	fi
}
backup_db() {
	RES=$(check_db_status)
	if [ $? != 1 ]; then
		start_postgresql
	fi
	pg_dump -d $DB_NAME -p $DB_PORT | gzip > $DB_BACKUP
	sleep 1
	if [ $? != 0 ]; then
		echo "X Failed to backup $SCRIPT_NAME database."
		exit 1
	else
		echo "√ $SCRIPT_NAME database backup successfully."
	fi
}
restore_db() {
	RES=$(check_db_status)
	if [ $? != 1 ]; then
		start_postgresql
	fi
	dropdb --if-exists "$DB_NAME" -p "$DB_PORT" &> /dev/null
	createdb "$DB_NAME" -p "$DB_PORT" &> /dev/null
	zcat $DB_BACKUP | psql -U "$DB_USER" -d "$DB_NAME" -p "$DB_PORT" &> /dev/null
	if [ $? != 0 ]; then
		echo "X Failed to restore $SCRIPT_NAME database."
		exit 1
	else
		echo "√ $SCRIPT_NAME database restore successfully."
	fi
}
reset_db() {
	RES=$(check_db_status)
	if [ $? == 1 ]; then
		stop_postgresql
	fi
	rm -rf $DB_DATA &> /dev/null
	echo "√ Remove db data if exist"
	rm $LOG_DB_FILE &> /dev/null
	pg_ctl initdb -D $DB_DATA -l "$LOG_DB_FILE" &> /dev/null
	echo "√ Create new db data"
	start_postgresql
	create_user
	create_database
}

#Node
start_pool() {
	RES=$(check_node_status)
	if [ $? == 1 ]; then
		echo $RES
	else
		pm2 start dpospool.js -n $SCRIPT_NAME -l $LOG_APP_FILE &> /dev/null;
		if [ $? == 0 ]; then
			echo "√ $SCRIPT_NAME started successfully."
			check_node_status
		else
			echo "X Failed to start $SCRIPT_NAME."
		fi
	fi
}
stop_pool() {
	RES=$(check_node_status)
	if [ $? != 1 ]; then
		echo $RES
	else
		pm2 stop $SCRIPT_NAME &> /dev/null;
		if [ $? !=  0 ]; then
			echo "X Failed to stop $SCRIPT_NAME."
		else
			echo "√ $SCRIPT_NAME stopped successfully."
		fi
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

#Other
cronjobs() {
	cmd='crontab'
	bash=$(command -v 'bash')
	node=$(command -v 'node')
	crontab=$($cmd -l 2> /dev/null | sed '/pool\.sh start/d' 2> /dev/null | sed '/pool\.sh payouts/d' 2> /dev/null)

	crontab=$(cat <<-EOF
	$crontab
	@reboot $bash $(pwd)/pool.sh start > $LOG_CRON_FILE 2>&1
	$PAYOUTS_TIME $node $(pwd)/libs/payouts.js > $LOG_CRON_FILE 2>&1
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
payouts() {
	RES=$(check_db_status)
	if [ $? == 1 ]; then
		start_postgresql
	fi
	echo "Start payouts script..."
	node $(pwd)"/libs/payouts.js" 2>&1 $LOG_APP_FILE
	sleep 3
	echo "Payouts end."
	exit 1
}
install_pool() {
	echo "#####$SCRIPT_NAME Installation#####"
	echo " * Installation may take several minutes..."
	check_cmds CMDS[@]
	echo "√ Check using commands."
	reset_db
	cronjobs
	echo " * Installation completed."
}
import_sql() {
	RES=$(check_db_status)
	if [ $? != 1 ]; then
		start_postgresql
	fi
	dropdb --if-exists "$DB_NAME" -p "$DB_PORT" &> /dev/null
	createdb "$DB_NAME" -p "$DB_PORT" &> /dev/null
	psql -U "$DB_USER" -d "$DB_NAME" -f "$(pwd)/"$DB_NAME"_dump.sql" -p "$DB_PORT" &> /dev/null
	if [ $? != 0 ]; then
		echo "X Failed import sql"
		exit 1
	else
		echo "√ Import done"
	fi
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
	echo -e "updatecron		- Update payouts time from config.json in crontab" 
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
	"restore_old")
		import_sql
		;;
	"updatecron")
		cronjobs
		;;
	"install")
		install_pool
		;;
	"start_node")
		start_pool
		;;
	"start")
		pm2 flush $SCRIPT_NAME
		rm $LOGS_DIR/*.log &> /dev/null
		start_postgresql
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
		stop_pool
		reset_db
		start_pool
		;;
	"backup_db")
		backup_db
		;;
	"restore_db")
		stop_pool
		restore_db
		start_pool
		;;
	"status")
		check_node_status
		check_db_status
		;;
	"payouts")
		payouts
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
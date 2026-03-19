# Makefile

include .env

help:
	@echo ""
	@echo "usage: make COMMAND"
	@echo ""
	@echo "Quick-start Commands:"
	@echo " start                       Create and start containers in detached mode"
	@echo " start-f                     Create and start containers"
	@echo " stop                        Stop containers"

start:
	@docker compose --env-file .env -f docker/docker-compose.yml up -d

start-f:
	@docker compose --env-file .env -f docker/docker-compose.yml up

stop:
	@docker compose --env-file .env --project-directory docker down

kill:
	@docker compose --env-file .env --project-directory docker kill

generate-init-sql:
	dbml2sql diagram.dbml --mysql -o sql/init.sql

db:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -it db mariadb -u root -p${DB_ROOT_PASSWORD} ${DB_NAME}

db-init:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} < ./sql/init.sql

db-dump:
	@docker compose --env-file .env -f docker/docker-compose.yml exec db mariadb-dump -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} > ./sql/dump.sql

db-restore:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} < ./sql/dump.sql

db-drop:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} -e "DROP DATABASE ${DB_NAME}; CREATE DATABASE ${DB_NAME};"
	
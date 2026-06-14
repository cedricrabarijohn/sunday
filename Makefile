# Makefile

include .env

help:
	@echo ""
	@echo "usage: make COMMAND"
	@echo ""
	@echo "Quick-start Commands:"
	@echo " start                       Create and start containers in detached mode (local storage)"
	@echo " start-f                     Create and start containers"
	@echo " start-s3                    Start with the bundled MinIO (STORAGE_DRIVER=s3)"
	@echo " stop                        Stop containers"
	@echo " kill                        Kill containers"
	@echo ""
	@echo "Database Commands:"
	@echo " generate-init-sql           Generate sql/init.sql"
	@echo " db                          Launch db container and access the database $(DB_NAME)"
	@echo " db-init                     Init the database from sql/init.sql file"
	@echo " db-seed                     Seed RBAC reference data (roles/capabilities) from sql/seed.sql"
	@echo " db-dump                     Dump the current database in sql/dump.sql"
	@echo " db-restore                  Restore the database from sql/dump.sql"
	@echo " db-drop                     Wipe out the database and create a fresh one"
	@echo " db-logs                     Follow database container logs"

start:
	@docker compose --env-file .env -f docker/docker-compose.yml up -d

start-f:
	@docker compose --env-file .env -f docker/docker-compose.yml up

start-s3:
	@COMPOSE_PROFILES=s3 docker compose --env-file .env -f docker/docker-compose.yml up -d

start-prod:
	@docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.production.yml up -d --build

start-prod-f:
	@docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.production.yml up --build

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

db-seed:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} < ./sql/seed.sql

db-dump:
	@docker compose --env-file .env -f docker/docker-compose.yml exec db mariadb-dump -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} > ./sql/dump.sql

db-restore:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} ${DB_NAME} < ./sql/dump.sql

db-drop:
	@docker compose --env-file .env -f docker/docker-compose.yml exec -T db mariadb -u root -p${DB_ROOT_PASSWORD} -e "DROP DATABASE ${DB_NAME}; CREATE DATABASE ${DB_NAME};"

db-logs:
	@docker compose --env-file .env -f docker/docker-compose.yml logs -f db
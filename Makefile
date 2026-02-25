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

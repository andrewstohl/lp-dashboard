#!/bin/bash

# Development helper script for DeFi LP Dashboard

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_help() {
    echo -e "${BLUE}DeFi LP Dashboard - Development Helper${NC}"
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  setup       - Initial project setup (install deps, create .env)"
    echo "  start       - Start all services with Docker Compose"
    echo "  stop        - Stop all services"
    echo "  restart     - Restart all services"
    echo "  logs        - View logs from all services"
    echo "  test        - Run all tests with coverage"
    echo "  test-watch  - Run tests in watch mode"
    echo "  redis       - Open Redis CLI"
    echo "  shell       - Open Python shell with app context"
    echo "  clean       - Clean up containers, volumes, cache"
    echo "  format      - Format code (black, isort)"
    echo "  lint        - Run linters (flake8, mypy)"
    echo "  check       - Run format, lint, and test"
    echo "  build       - Build Docker images"
    echo "  help        - Show this help message"
}

function setup() {
    echo -e "${BLUE}Setting up development environment...${NC}"

    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        echo -e "${YELLOW}Creating .env file...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo -e "${YELLOW}⚠ Please edit .env and add your API keys${NC}"
    else
        echo -e "${GREEN}✓ .env file already exists${NC}"
    fi

    # Install backend dependencies
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    cd backend
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"

    echo -e "${GREEN}✓ Setup complete!${NC}"
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Edit .env and add your DEBANK_ACCESS_KEY"
    echo "  2. Run: ./dev.sh start"
}

function start_services() {
    echo -e "${BLUE}Starting services...${NC}"
    docker-compose up -d
    echo -e "${GREEN}✓ Services started${NC}"
    echo ""
    echo "  Backend API: http://localhost:8000"
    echo "  API Docs:    http://localhost:8000/docs"
    echo "  Health:      http://localhost:8000/health"
    echo ""
    echo "View logs: ./dev.sh logs"
}

function stop_services() {
    echo -e "${BLUE}Stopping services...${NC}"
    docker-compose down
    echo -e "${GREEN}✓ Services stopped${NC}"
}

function restart_services() {
    echo -e "${BLUE}Restarting services...${NC}"
    docker-compose restart
    echo -e "${GREEN}✓ Services restarted${NC}"
}

function view_logs() {
    docker-compose logs -f
}

function run_tests() {
    echo -e "${BLUE}Running tests...${NC}"
    cd backend
    source venv/bin/activate
    pytest tests/ --cov=backend --cov-report=html --cov-report=term
    echo -e "${GREEN}✓ Tests complete${NC}"
    echo -e "${YELLOW}View coverage: open backend/htmlcov/index.html${NC}"
}

function test_watch() {
    echo -e "${BLUE}Running tests in watch mode...${NC}"
    cd backend
    source venv/bin/activate
    pytest-watch tests/
}

function open_redis() {
    echo -e "${BLUE}Opening Redis CLI...${NC}"
    redis-cli
}

function open_shell() {
    echo -e "${BLUE}Opening Python shell...${NC}"
    cd backend
    source venv/bin/activate
    python3 -i -c "
from backend.app.main import app
from backend.core.config import settings
from backend.services.debank import get_debank_service
print('Available: app, settings, get_debank_service')
"
}

function clean() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    docker-compose down -v
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

function format_code() {
    echo -e "${BLUE}Formatting code...${NC}"
    cd backend
    source venv/bin/activate
    black . || echo -e "${YELLOW}Install black: pip install black${NC}"
    isort . || echo -e "${YELLOW}Install isort: pip install isort${NC}"
    echo -e "${GREEN}✓ Code formatted${NC}"
}

function lint_code() {
    echo -e "${BLUE}Linting code...${NC}"
    cd backend
    source venv/bin/activate
    flake8 . || echo -e "${YELLOW}Install flake8: pip install flake8${NC}"
    mypy . || echo -e "${YELLOW}Install mypy: pip install mypy${NC}"
}

function check_all() {
    echo -e "${BLUE}Running all checks...${NC}"
    format_code
    lint_code
    run_tests
    echo -e "${GREEN}✓ All checks passed${NC}"
}

function build_images() {
    echo -e "${BLUE}Building Docker images...${NC}"
    docker-compose build
    echo -e "${GREEN}✓ Images built${NC}"
}

# Main script logic
case "$1" in
    setup)
        setup
        ;;
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    logs)
        view_logs
        ;;
    test)
        run_tests
        ;;
    test-watch)
        test_watch
        ;;
    redis)
        open_redis
        ;;
    shell)
        open_shell
        ;;
    clean)
        clean
        ;;
    format)
        format_code
        ;;
    lint)
        lint_code
        ;;
    check)
        check_all
        ;;
    build)
        build_images
        ;;
    help|--help|-h)
        print_help
        ;;
    *)
        if [ -z "$1" ]; then
            print_help
        else
            echo -e "${RED}Unknown command: $1${NC}"
            echo ""
            print_help
            exit 1
        fi
        ;;
esac

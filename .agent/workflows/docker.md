---
description: Start/stop backend using Docker
---

# Docker Backend Workflow

This workflow helps you manage the backend server using Docker.

## Prerequisites

Make sure Docker Desktop is installed and running on your Mac.

## Starting the Backend

1. **Build the Docker image** (first time or after dependency changes):
   ```bash
   docker-compose build
   ```

// turbo
2. **Start the backend container**:
   ```bash
   docker-compose up -d
   ```
   The `-d` flag runs the container in detached mode (background).

3. **Verify the backend is running**:
   ```bash
   docker-compose logs backend
   ```
   You should see: "Server running on http://localhost:3000"

4. **Check backend status**:
   ```bash
   curl http://localhost:3000/api/status
   ```

## Stopping the Backend

// turbo
1. **Stop the backend container**:
   ```bash
   docker-compose down
   ```

## Viewing Logs

// turbo
- **View real-time logs**:
  ```bash
  docker-compose logs -f backend
  ```
  Press `Ctrl+C` to exit log viewing.

- **View last 50 lines**:
  ```bash
  docker-compose logs --tail=50 backend
  ```

## Rebuilding After Changes

**After changing dependencies** (package.json):
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

**After changing source code**: No rebuild needed! The code is mounted as a volume, and nodemon will auto-reload.

## Troubleshooting

**Port 3000 already in use**:
```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

**Container won't start**:
```bash
# View detailed logs
docker-compose logs backend

# Remove and recreate container
docker-compose down
docker-compose up -d
```

**Reset everything**:
```bash
# Remove all containers and volumes
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

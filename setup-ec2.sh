#!/usr/bin/env bash
set -euo pipefail

echo "============================================="
echo "   Setting up EC2 for YouTube RAG Backend    "
echo "============================================="

# 1. Update OS and install base tools
echo "[1/5] Updating packages..."
if command -v dnf &> /dev/null; then
  sudo dnf update -y
  sudo dnf install -y git curl wget
else
  sudo yum update -y
  sudo yum install -y git curl wget
fi

# 2. Install Node.js 20 LTS & PM2
echo "[2/5] Installing Node.js 20 LTS and PM2..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
if command -v dnf &> /dev/null; then
  sudo dnf install -y nodejs
else
  sudo yum install -y nodejs
fi
sudo npm install -g pm2

# 3. Install Docker and start Qdrant vector database
echo "[3/5] Setting up Docker & Qdrant..."
if command -v dnf &> /dev/null; then
  sudo dnf install -y docker
else
  sudo yum install -y docker
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

mkdir -p "$HOME/qdrant_storage"
if ! sudo docker ps -a --format '{{.Names}}' | grep -q "^qdrant$"; then
  sudo docker run -d \
    --name qdrant \
    --restart always \
    -p 6333:6333 \
    -p 6334:6334 \
    -v "$HOME/qdrant_storage:/qdrant/storage:z" \
    qdrant/qdrant
else
  sudo docker start qdrant || true
fi

# 4. Install Ollama & pull required models
echo "[4/5] Installing Ollama & models (nomic-embed-text, llama3.2)..."
if ! command -v ollama &> /dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
sudo systemctl enable --now ollama
sleep 3
ollama pull nomic-embed-text
ollama pull llama3.2

# 5. Summary verification
echo "============================================="
echo "   Verification of Installed Services:       "
echo "============================================="
echo "Node:   $(node -v)"
echo "NPM:    $(npm -v)"
echo "PM2:    $(pm2 -v)"
echo "Docker: $(sudo docker ps --filter name=qdrant --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}')"
echo "Ollama: $(ollama list)"
echo "============================================="
echo "Setup successfully completed!"


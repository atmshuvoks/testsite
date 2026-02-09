#!/bin/bash
# Deploy AllJobs to Oracle VPS
# Run this script on the VPS: bash deploy.sh

set -e

echo "🚀 AllJobs Deployment Script"
echo "============================="

# Install Node.js 23 if not installed
if ! command -v node &> /dev/null || [[ $(node -v) != v23* ]]; then
    echo "📦 Installing Node.js 23..."
    curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node version: $(node -v)"

# Clone or update repo
if [ -d "testsite" ]; then
    echo "📥 Updating existing repo..."
    cd testsite
    git pull
else
    echo "📥 Cloning repo..."
    git clone https://github.com/atmshuvoks/testsite.git
    cd testsite
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Create .env.local
echo "⚙️ Creating .env.local..."
cat > .env.local << 'EOF'
TELEGRAM_BOT_TOKEN=8278443561:AAEPP_IlOVpRwg969WBYXvRoNdPHA9rTntY
APP_BASE_URL=http://129.151.146.209:3000
COMPUTER_JOBS_LIMIT=25
EOF

# Initialize database
echo "🗄️ Initializing database..."
npm run db:init

# Sync jobs
echo "🔄 Syncing jobs from AllJobs..."
npm run sync

# Build
echo "🔨 Building Next.js..."
npm run build

# Create systemd service for Next.js
echo "📝 Creating systemd service..."
sudo tee /etc/systemd/system/alljobs.service > /dev/null << EOF
[Unit]
Description=AllJobs Mirror
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which npm) run start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for Telegram bot
sudo tee /etc/systemd/system/alljobs-bot.service > /dev/null << EOF
[Unit]
Description=AllJobs Telegram Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which npm) run telegram:bot
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
echo "🚀 Starting services..."
sudo systemctl daemon-reload
sudo systemctl enable alljobs alljobs-bot
sudo systemctl restart alljobs alljobs-bot

# Open firewall
echo "🔥 Opening firewall port 3000..."
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT || true

echo ""
echo "✅ Deployment complete!"
echo "========================"
echo "🌐 Web: http://129.151.146.209:3000"
echo "🤖 Telegram bot: Running"
echo ""
echo "Check status:"
echo "  sudo systemctl status alljobs"
echo "  sudo systemctl status alljobs-bot"

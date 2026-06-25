#!/bin/bash

# Setup Production Monitoring
# This script configures cron jobs and alerting for OnSocial services

set -e

echo "🔧 Setting up OnSocial Production Monitoring"
echo ""

# Make monitoring script executable
chmod +x scripts/monitor_production.sh
chmod +x scripts/monitor_dashboard.js

echo "✓ Made scripts executable"

# Cron job setup
read -p "Do you want to set up cron monitoring (checks every 5 minutes)? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    LOG_DIR="$HOME/.onsocial-logs"
    
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    CRON_CMD="*/5 * * * * cd $SCRIPT_DIR && ./scripts/monitor_production.sh >> $LOG_DIR/monitor.log 2>&1"
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "monitor_production.sh"; then
        echo "⚠️  Cron job already exists"
    else
        # Add cron job
        (crontab -l 2>/dev/null; echo ""; echo "# OnSocial Production Monitoring"; echo "$CRON_CMD") | crontab -
        echo "✓ Added cron job (runs every 5 minutes)"
        echo "  Log file: $LOG_DIR/monitor.log"
        
        # Run initial check
        echo "  Running initial health check..."
        cd "$SCRIPT_DIR" && ./scripts/monitor_production.sh >> "$LOG_DIR/monitor.log" 2>&1
        echo "  Check logs: tail -f $LOG_DIR/monitor.log"
    fi
fi

echo ""

# Alert webhook setup
read -p "Do you want to configure Discord/Slack alerts? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Enter your webhook URLs (leave blank to skip):"
    echo ""
    
    read -p "Discord Webhook URL: " DISCORD_WEBHOOK
    read -p "Slack Webhook URL: " SLACK_WEBHOOK
    
    # Add to .env if not already there
    if [ -f ".env" ]; then
        if ! grep -q "DISCORD_WEBHOOK_URL" .env; then
            echo "" >> .env
            echo "# Monitoring Alerts" >> .env
            [ -n "$DISCORD_WEBHOOK" ] && echo "DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK" >> .env
            [ -n "$SLACK_WEBHOOK" ] && echo "SLACK_WEBHOOK_URL=$SLACK_WEBHOOK" >> .env
            echo "✓ Added webhooks to .env"
        else
            echo "⚠️  Webhook config already exists in .env"
        fi
    fi
fi

echo ""
echo "================================================"
echo "✅ Monitoring setup complete!"
echo ""
echo "Quick Commands:"
echo "  Manual check:  ./scripts/monitor_production.sh"
echo "  Dashboard:     node scripts/monitor_dashboard.js"
echo "  View logs:     tail -f /var/log/onsocial-monitor.log"
echo ""
echo "Dashboard URL:   http://localhost:3030"
echo "API Endpoint:    http://localhost:3030/api/status"
echo "================================================"

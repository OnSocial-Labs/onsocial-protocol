#!/usr/bin/env node

/**
 * OnSocial Production Monitoring Dashboard
 * Simple web dashboard showing real-time service status
 * 
 * Run: node scripts/monitor_dashboard.js
 * Visit: http://localhost:3030
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple fetch polyfill for older Node.js
global.fetch = global.fetch || function(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = options.timeout || 5000;
    
    const req = protocol.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => JSON.parse(data),
          text: async () => data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
};

// Load .env file manually (no external dependencies)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return;
      // Remove 'export ' prefix if present
      line = line.replace(/^export\s+/, '');
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Only set if not already set in environment
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    });
    console.log('📋 Loaded environment from .env');
  }
}

loadEnv();

// Configuration
const PORT = process.env.MONITOR_PORT || 3030;
const HASURA_URL = process.env.HASURA_URL || 'http://135.181.110.183:8080';
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || '';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://135.181.110.183:4000';
const POSTGRES_HOST = process.env.POSTGRES_HOST || '135.181.110.183';
const POSTGRES_PORT = process.env.POSTGRES_PORT || 5432;
const SUBSTREAMS_API_TOKEN = process.env.SUBSTREAMS_API_TOKEN || '';
const CHECK_INTERVAL = 30000; // 30 seconds

// Service status cache
let serviceStatus = {
  lastUpdate: null,
  services: {
    hasura: { status: 'unknown', latency: 0, lastCheck: null },
    hasuraGraphQL: { status: 'unknown', latency: 0, lastCheck: null },
    gateway: { status: 'unknown', latency: 0, lastCheck: null },
    postgres: { status: 'unknown', latency: 0, lastCheck: null },
    lighthouse: { status: 'unknown', latency: 0, lastCheck: null },
    substreams: { status: 'unknown', latency: 0, lastCheck: null },
  },
  credits: {
    price: null,
    creditsPerSocial: null,
    revenue: null,
    stats: null,
  },
};

// HTTP request helper
function checkEndpoint(url, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, options, (res) => {
      const latency = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;
      
      res.resume(); // Consume response
      resolve({ success, latency, statusCode: res.statusCode });
    });
    
    req.on('error', () => {
      resolve({ success: false, latency: Date.now() - startTime, statusCode: 0 });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, latency: 10000, statusCode: 0 });
    });
  });
}

// GraphQL check
function checkGraphQL(url, adminSecret) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const postData = JSON.stringify({
      query: '{ __typename }'
    });
    
    const urlObj = new URL(url);
    const port = urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === 'https:' ? 443 : 80);
    const options = {
      hostname: urlObj.hostname,
      port: port,
      path: '/v1/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-hasura-admin-secret': adminSecret
      },
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          const success = json.data && json.data.__typename === 'query_root';
          resolve({ success, latency, statusCode: res.statusCode });
        } catch (err) {
          resolve({ success: false, latency, statusCode: res.statusCode, error: err.message });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({ success: false, latency: Date.now() - startTime, statusCode: 0, error: err.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, latency: 5000, statusCode: 0, error: 'timeout' });
    });
    
    req.write(postData);
    req.end();
  });
}

// PostgreSQL check (TCP connection test)
function checkPostgres(host, port) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, latency, statusCode: 200 });
    });
    
    socket.on('error', () => {
      resolve({ success: false, latency: Date.now() - startTime, statusCode: 0 });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, latency: 5000, statusCode: 0 });
    });
    
    socket.connect(port, host);
  });
}

// Substreams API check - just verify the token is valid by checking near.substreams.pinax.network
function checkSubstreams(apiToken) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Check if the Pinax endpoint is reachable (gRPC endpoint, just do TCP check)
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      // If we can connect to the endpoint and token is configured, consider it healthy
      resolve({ success: apiToken && apiToken.length > 0, latency, statusCode: 200 });
    });
    
    socket.on('error', () => {
      resolve({ success: false, latency: Date.now() - startTime, statusCode: 0 });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, latency: 5000, statusCode: 0 });
    });
    
    // Connect to Pinax NEAR Substreams endpoint
    socket.connect(443, 'near.substreams.pinax.network');
  });
}

// Run all health checks
async function runHealthChecks() {
  console.log(`[${new Date().toISOString()}] Running health checks...`);
  
  // Check Hasura health endpoint
  const hasuraHealth = await checkEndpoint(`${HASURA_URL}/healthz`);
  serviceStatus.services.hasura = {
    status: hasuraHealth.success ? 'healthy' : 'down',
    latency: hasuraHealth.latency,
    lastCheck: new Date().toISOString()
  };
  
  // Check Hasura GraphQL API
  const hasuraUrl = new URL(HASURA_URL);
  const hasuraGraphQL = await checkGraphQL(`${hasuraUrl.protocol}//${hasuraUrl.host}`, HASURA_ADMIN_SECRET);
  serviceStatus.services.hasuraGraphQL = {
    status: hasuraGraphQL.success ? 'healthy' : 'down',
    latency: hasuraGraphQL.latency,
    lastCheck: new Date().toISOString(),
    url: `${HASURA_URL}/v1/graphql`,
    error: hasuraGraphQL.error || null
  };
  
  // Check Gateway
  const gatewayHealth = await checkEndpoint(`${GATEWAY_URL}/graph/health`);
  serviceStatus.services.gateway = {
    status: gatewayHealth.success ? 'healthy' : 'down',
    latency: gatewayHealth.latency,
    lastCheck: new Date().toISOString()
  };
  
  // Check Gateway Config (tier info)
  try {
    const gatewayConfigUrl = `${GATEWAY_URL}/auth/config`;
    const configResponse = await fetch(gatewayConfigUrl, { timeout: 5000 });
    const config = await configResponse.json();
    serviceStatus.gatewayConfig = config;
  } catch (error) {
    serviceStatus.gatewayConfig = null;
  }
  
  // Check Credit System (price + revenue)
  try {
    const priceUrl = `${GATEWAY_URL}/credits/price`;
    const priceResponse = await fetch(priceUrl, { timeout: 5000 });
    const priceData = await priceResponse.json();
    serviceStatus.credits.price = priceData.socialPriceUsd;
    serviceStatus.credits.creditsPerSocial = priceData.creditsPerSocial;
  } catch (error) {
    serviceStatus.credits.price = null;
  }
  
  try {
    const statsUrl = `${GATEWAY_URL}/credits/stats`;
    const statsResponse = await fetch(statsUrl, { timeout: 5000 });
    const statsData = await statsResponse.json();
    serviceStatus.credits.stats = statsData.thisMonth;
    serviceStatus.credits.revenue = statsData.thisMonth?.totalRevenueUsd || 0;
  } catch (error) {
    serviceStatus.credits.stats = null;
  }
  
  // Check PostgreSQL
  const postgresHealth = await checkPostgres(POSTGRES_HOST, POSTGRES_PORT);
  serviceStatus.services.postgres = {
    status: postgresHealth.success ? 'healthy' : 'down',
    latency: postgresHealth.latency,
    lastCheck: new Date().toISOString(),
    note: 'Database (Hasura backend)'
  };
  
  // Check Lighthouse (public gateway) - note: test CID may not exist, so we accept any response
  const lighthouseHealth = await checkEndpoint('https://gateway.lighthouse.storage/ipfs/QmNjMp9K8cY8K7S7QvZmVWbU5vVJqJZ2H3PnGwG4n3rGF8');
  serviceStatus.services.lighthouse = {
    status: lighthouseHealth.statusCode > 0 && lighthouseHealth.statusCode < 600 ? 'healthy' : 'down',
    latency: lighthouseHealth.latency,
    lastCheck: new Date().toISOString(),
    note: 'IPFS Storage (Free tier)'
  };
  
  // Check Substreams API
  if (SUBSTREAMS_API_TOKEN) {
    const substreamsHealth = await checkSubstreams(SUBSTREAMS_API_TOKEN);
    serviceStatus.services.substreams = {
      status: substreamsHealth.success ? 'healthy' : 'down',
      latency: substreamsHealth.latency,
      lastCheck: new Date().toISOString(),
      note: 'Indexing service (Free tier - 7M blocks/mo)'
    };
  } else {
    serviceStatus.services.substreams = {
      status: 'unknown',
      latency: 0,
      lastCheck: new Date().toISOString(),
      note: 'API token not configured'
    };
  }
  
  serviceStatus.lastUpdate = new Date().toISOString();
}

// HTML dashboard
function generateDashboard() {
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  
  return `
<!DOCTYPE html>
<html>
<head>
    <title>OnSocial Production Monitor</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2d3748;
            margin-bottom: 10px;
        }
        .meta {
            color: #718096;
            font-size: 14px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }
        .card:hover {
            transform: translateY(-2px);
        }
        .service-name {
            font-size: 18px;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-healthy {
            background: #c6f6d5;
            color: #22543d;
        }
        .status-down {
            background: #fed7d7;
            color: #742a2a;
        }
        .status-unknown {
            background: #e2e8f0;
            color: #4a5568;
        }
        .metric {
            margin: 12px 0;
            padding: 12px;
            background: #f7fafc;
            border-radius: 8px;
        }
        .metric-label {
            font-size: 12px;
            color: #718096;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: 700;
            color: #2d3748;
        }
        .footer {
            text-align: center;
            color: white;
            margin-top: 30px;
            opacity: 0.9;
        }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        .indicator-healthy { background: #48bb78; }
        .indicator-down { background: #f56565; }
        .indicator-unknown { background: #cbd5e0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 OnSocial Production Monitor</h1>
            <div class="meta">
                Last updated: ${serviceStatus.lastUpdate || 'Never'} • 
                Monitor uptime: ${uptimeStr} •
                Auto-refresh: 30s
            </div>
        </div>
        
        <div class="grid">
            ${Object.entries(serviceStatus.services).map(([name, service]) => `
                <div class="card">
                    <div class="service-name">
                        <span class="status-indicator indicator-${service.status}"></span>
                        ${name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1')}
                    </div>
                    <span class="status-badge status-${service.status}">${service.status}</span>
                    
                    <div class="metric">
                        <div class="metric-label">Latency</div>
                        <div class="metric-value">${service.latency}ms</div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-label">Last Check</div>
                        <div class="metric-value" style="font-size: 14px;">
                            ${service.lastCheck ? new Date(service.lastCheck).toLocaleTimeString() : 'Never'}
                        </div>
                    </div>
                    ${service.note ? `<div style="margin-top: 8px; font-size: 12px; color: #718096;">${service.note}</div>` : ''}
                </div>
            `).join('')}
        </div>
        
        ${serviceStatus.gatewayConfig ? `
        <div class="card" style="margin-bottom: 20px;">
            <div class="service-name">⚙️ Gateway Configuration</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 16px;">
                <div class="metric">
                    <div class="metric-label">Network</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.network}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Free Tier Rate Limit</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.rateLimits.free}/min</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Starter Tier Rate Limit</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.rateLimits.starter}/min</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Staker Tier Rate Limit</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.rateLimits.staker}/min</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Builder Tier Rate Limit</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.rateLimits.builder}/min</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Pro Tier Rate Limit</div>
                    <div class="metric-value" style="font-size: 16px;">${serviceStatus.gatewayConfig.rateLimits.pro >= 1000000 ? 'Unlimited' : serviceStatus.gatewayConfig.rateLimits.pro + '/min'}</div>
                </div>
            </div>
            <div style="margin-top: 16px; padding: 12px; background: #f7fafc; border-radius: 8px;">
                <div style="font-size: 12px; color: #718096; margin-bottom: 8px;">INFRASTRUCTURE COSTS</div>
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <div>
                        <strong>Lighthouse:</strong> ${serviceStatus.gatewayConfig.infrastructure.lighthouse.plan} 
                        ($${serviceStatus.gatewayConfig.infrastructure.lighthouse.cost}/mo)
                    </div>
                    <div>
                        <strong>Substreams:</strong> ${serviceStatus.gatewayConfig.infrastructure.substreams.plan} 
                        ($${serviceStatus.gatewayConfig.infrastructure.substreams.cost}/mo)
                    </div>
                    <div>
                        <strong>Total:</strong> <span style="color: #48bb78; font-weight: 700;">$${serviceStatus.gatewayConfig.infrastructure.totalCost}/mo</span>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${serviceStatus.credits.price !== null ? `
        <div class="card" style="margin-bottom: 20px;">
            <div class="service-name">💰 Credit System</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 16px;">
                <div class="metric">
                    <div class="metric-label">SOCIAL Price</div>
                    <div class="metric-value" style="font-size: 20px;">$${serviceStatus.credits.price?.toFixed(4) || '0.00'}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Credits / SOCIAL</div>
                    <div class="metric-value" style="font-size: 20px;">${serviceStatus.credits.creditsPerSocial || '0'}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Revenue This Month</div>
                    <div class="metric-value" style="font-size: 20px; color: #48bb78;">$${(serviceStatus.credits.revenue || 0).toFixed(2)}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Credits Sold</div>
                    <div class="metric-value" style="font-size: 20px;">${(serviceStatus.credits.stats?.totalCreditsSold || 0).toLocaleString()}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Unique Buyers</div>
                    <div class="metric-value" style="font-size: 20px;">${serviceStatus.credits.stats?.uniqueBuyers || 0}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Total Purchases</div>
                    <div class="metric-value" style="font-size: 20px;">${serviceStatus.credits.stats?.totalPurchases || 0}</div>
                </div>
            </div>
            <div style="margin-top: 16px; padding: 12px; background: #f7fafc; border-radius: 8px;">
                <div style="font-size: 12px; color: #718096; margin-bottom: 8px;">PRICING (USD-Pegged)</div>
                <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 14px;">
                    <div><strong>Upload:</strong> 1 credit/MB ($0.01/MB)</div>
                    <div><strong>Relay:</strong> 5 credits/tx ($0.05/tx)</div>
                    <div><strong>Reads:</strong> FREE (rate limited)</div>
                </div>
            </div>
        </div>
        ` : ''}
        
        <div class="footer">
            <p>OnSocial Protocol • Production Infrastructure Monitor</p>
        </div>
    </div>
</body>
</html>
  `;
}

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/api/status') {
    // JSON API endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(serviceStatus, null, 2));
  } else if (req.url === '/health') {
    // Simple health check
    const allHealthy = Object.values(serviceStatus.services)
      .every(s => s.status === 'healthy');
    res.writeHead(allHealthy ? 200 : 503, { 'Content-Type': 'text/plain' });
    res.end(allHealthy ? 'OK' : 'DEGRADED');
  } else {
    // HTML dashboard
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(generateDashboard());
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`\n🎯 OnSocial Production Monitor`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/status`);
  console.log(`💚 Health: http://localhost:${PORT}/health\n`);
  
  // Run initial check
  runHealthChecks();
  
  // Schedule periodic checks
  setInterval(runHealthChecks, CHECK_INTERVAL);
});

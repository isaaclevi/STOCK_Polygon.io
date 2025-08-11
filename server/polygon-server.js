// server/polygon-server.js
require('dotenv').config();
const WebSocket = require('ws');

// Create WebSocket server for clients
const PORT = parseInt(process.env.PORT) || 3002;
const wss = new WebSocket.Server({ port: PORT });

console.log('🚀 WebSocket server running on ws://localhost:'+PORT);

// Your Polygon.io API key (replace with your actual key)
const POLYGON_API_KEY = process.env.POLYGON_API_KEY; // Get from https://polygon.io/

// Store client connections by stock symbol
const stockRooms = new Map();
const availableStocks = ['JOBY', 'ACHR', 'SVIX', 'UVIX', 'VXX', 'WULF'];

// Store recent trades for candlestick aggregation
const tradeBuffer = new Map();
const candlestickInterval = 30000; // 30 seconds

// Initialize trade buffers
availableStocks.forEach(symbol => {
  tradeBuffer.set(symbol, {
    trades: [],
    lastCandleTime: null,
    volume: 0
  });
});

// Connect to Polygon.io WebSocket
let polygonWs = null;

function connectToPolygon() {
  console.log('🔌 Connecting to Polygon.io...');
  
  polygonWs = new WebSocket('wss://socket.polygon.io/stocks');
  
  polygonWs.on('open', () => {
    console.log('✅ Connected to Polygon.io');
    
    // Authenticate with Polygon.io
    polygonWs.send(JSON.stringify({
      action: 'auth',
      params: POLYGON_API_KEY
    }));
  });
  
  polygonWs.on('message', (data) => {
    try {
      const messages = JSON.parse(data);
      
      // Handle different message types
      messages.forEach(message => {
        switch (message.ev) {
          case 'status':
            console.log('📡 Polygon status:', message.message);
            
            // After successful auth, subscribe to stocks
            if (message.status === 'auth_success') {
              console.log('🔐 Authentication successful');
              subscribeToStocks();
            }
            break;
            
          case 'T': // Trade data
            handleTradeData(message);
            break;
            
          case 'Q': // Quote data (optional)
            // You can handle quotes here if needed
            break;
            
          default:
            // Other message types
            break;
        }
      });
    } catch (error) {
      console.error('❌ Error parsing Polygon data:', error);
    }
  });
  
  polygonWs.on('close', () => {
    console.log('🔌 Disconnected from Polygon.io');
    // Attempt to reconnect after 5 seconds
    setTimeout(connectToPolygon, 5000);
  });
  
  polygonWs.on('error', (error) => {
    console.error('❌ Polygon WebSocket error:', error);
  });
}

function subscribeToStocks() {
  // Subscribe to trades for your stocks
  availableStocks.forEach(symbol => {
    polygonWs.send(JSON.stringify({
      action: 'subscribe',
      params: `T.${symbol}` // T = Trades
    }));
    console.log(`📈 Subscribed to ${symbol} trades`);
  });
  
  // Optional: Subscribe to quotes for real-time bid/ask
  // availableStocks.forEach(symbol => {
  //   polygonWs.send(JSON.stringify({
  //     action: 'subscribe',
  //     params: `Q.${symbol}` // Q = Quotes
  //   }));
  // });
}

function handleTradeData(trade) {
  const symbol = trade.sym; // Symbol
  const price = trade.p;    // Price
  const size = trade.s;     // Size (volume)
  const timestamp = trade.t; // Timestamp
  
  if (!availableStocks.includes(symbol)) return;
  
  const buffer = tradeBuffer.get(symbol);
  if (!buffer) return;
  
  // Add trade to buffer
  buffer.trades.push({
    price: price,
    volume: size,
    timestamp: timestamp
  });
  
  buffer.volume += size;
  
  // Check if we need to create a new candlestick
  const candleTime = Math.floor(timestamp / candlestickInterval) * candlestickInterval;
  
  if (buffer.lastCandleTime !== candleTime) {
    // Create candlestick from previous period if we have trades
    if (buffer.lastCandleTime && buffer.trades.length > 0) {
      createCandlestick(symbol, buffer, buffer.lastCandleTime);
    }
    
    // Start new candle period
    buffer.lastCandleTime = candleTime;
    buffer.trades = [{
      price: price,
      volume: size,
      timestamp: timestamp
    }];
    buffer.volume = size;
  }
  
  // Update current candle in real-time
  updateCurrentCandle(symbol, buffer, candleTime);
}

function createCandlestick(symbol, buffer, candleTime) {
  if (buffer.trades.length === 0) return;
  
  // Calculate OHLC from trades
  const prices = buffer.trades.map(t => t.price);
  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const volume = buffer.trades.reduce((sum, t) => sum + t.volume, 0);
  
  const candlestick = {
    symbol: symbol,
    timestamp: candleTime,
    open: parseFloat(open.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    close: parseFloat(close.toFixed(2)),
    volume: Math.floor(volume)
  };
  
  // Send to subscribed clients
  sendToClients(symbol, candlestick);
}

function updateCurrentCandle(symbol, buffer, candleTime) {
  if (buffer.trades.length === 0) return;
  
  const prices = buffer.trades.map(t => t.price);
  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const volume = buffer.trades.reduce((sum, t) => sum + t.volume, 0);
  
  const candlestick = {
    symbol: symbol,
    timestamp: candleTime,
    open: parseFloat(open.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    close: parseFloat(close.toFixed(2)),
    volume: Math.floor(volume),
    isLive: true // Flag to indicate this is a live/updating candle
  };
  
  // Send to subscribed clients
  sendToClients(symbol, candlestick);
}

function sendToClients(symbol, candlestick) {
  if (stockRooms.has(symbol)) {
    const clients = stockRooms.get(symbol);
    const message = JSON.stringify(candlestick);
    
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    console.log(`📊 Sent ${symbol} candle: $${candlestick.close} (Vol: ${candlestick.volume})`);
  }
}

// Handle client connections
wss.on('connection', (ws) => {
  console.log('👤 New client connected');
  let currentStock = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.action === 'subscribe') {
        // Unsubscribe from previous stock
        if (currentStock && stockRooms.has(currentStock)) {
          const clients = stockRooms.get(currentStock);
          const index = clients.indexOf(ws);
          if (index > -1) {
            clients.splice(index, 1);
            console.log(`📉 Client unsubscribed from ${currentStock}`);
          }
        }
        
        // Subscribe to new stock
        currentStock = data.symbol;
        if (availableStocks.includes(currentStock)) {
          if (!stockRooms.has(currentStock)) {
            stockRooms.set(currentStock, []);
          }
          stockRooms.get(currentStock).push(ws);
          console.log(`📈 Client subscribed to ${currentStock}`);
        } else {
          console.log(`❌ Invalid stock symbol: ${currentStock}`);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing client message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('👤 Client disconnected');
    if (currentStock && stockRooms.has(currentStock)) {
      const clients = stockRooms.get(currentStock);
      const index = clients.indexOf(ws);
      if (index > -1) {
        clients.splice(index, 1);
        console.log(`📉 Client removed from ${currentStock} room`);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ Client WebSocket error:', error);
  });
});

// Start connection to Polygon.io
if (POLYGON_API_KEY) {
  console.log('🔑 Found Polygon API key, connecting to live data...');
  connectToPolygon();
} else {
  console.log('❌ Please set your Polygon.io API key in the POLYGON_API_KEY environment variable');
  console.log('📝 Get your API key from: https://polygon.io/');
  console.log('🔄 Using simulated data instead...');
  
  // Fall back to simulated data
  require('./server.js');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  if (polygonWs) polygonWs.close();
  wss.close();
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  if (polygonWs) polygonWs.close();
  wss.close();
  process.exit(0);
});
// server/server.js
require('dotenv').config();
const WebSocket = require('ws');

// Create WebSocket server on port process.env.PORT
const PORT = parseInt(process.env.PORT) || 3002;
const wss = new WebSocket.Server({ port: PORT });

console.log('🚀 WebSocket server running on ws://localhost:'+PORT);

// Store client connections by stock symbol
const stockRooms = new Map();
const availableStocks = ['JOBY', 'ACHR', 'SVIX', 'UVIX', 'VXX', 'WULF'];

// Candlestick data storage for each stock
const candlestickData = new Map();

// Initialize candlestick data for each stock
availableStocks.forEach(symbol => {
  candlestickData.set(symbol, {
    currentCandle: null,
    candleStartTime: null,
    basePrice: getBasePriceForStock(symbol)
  });
});

function getBasePriceForStock(stock) {
  const basePrices = {
    'JOBY': 6.50,
    'ACHR': 4.25,
    'SVIX': 45.80,
    'UVIX': 23.40,
    'VXX': 38.90,
    'WULF': 8.75
  };
  return basePrices[stock] || 10.00;
}

// Generate realistic candlestick data
function generateCandlestickData(symbol) {
  const stockData = candlestickData.get(symbol);
  if (!stockData) return;

  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 30000) * 30000; // 30-second candles
  
  // Create new candle if time period changed
  if (!stockData.candleStartTime || currentMinute !== stockData.candleStartTime) {
    if (stockData.currentCandle) {
      // Send completed candle to clients
      if (stockRooms.has(symbol)) {
        const clients = stockRooms.get(symbol);
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(stockData.currentCandle));
          }
        });
      }
    }
    
    // Start new candle
    stockData.candleStartTime = currentMinute;
    const priceChange = (Math.random() - 0.5) * 4; // Random change between -2 and +2
    const newPrice = Math.max(0.1, stockData.basePrice + priceChange); // Ensure price stays positive
    
    stockData.currentCandle = {
      symbol: symbol,
      timestamp: currentMinute,
      open: parseFloat(newPrice.toFixed(2)),
      high: parseFloat(newPrice.toFixed(2)),
      low: parseFloat(newPrice.toFixed(2)),
      close: parseFloat(newPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 10000) + 1000
    };
    stockData.basePrice = newPrice;
  } else {
    // Update current candle
    if (stockData.currentCandle) {
      const priceChange = (Math.random() - 0.5) * 2; // Smaller intracandle movements
      const newPrice = Math.max(0.1, stockData.basePrice + priceChange);
      
      stockData.currentCandle.close = parseFloat(newPrice.toFixed(2));
      stockData.currentCandle.high = Math.max(stockData.currentCandle.high, newPrice);
      stockData.currentCandle.low = Math.min(stockData.currentCandle.low, newPrice);
      stockData.currentCandle.volume += Math.floor(Math.random() * 500);
      stockData.basePrice = newPrice;
      
      // Send updated candle to clients
      if (stockRooms.has(symbol)) {
        const clients = stockRooms.get(symbol);
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(stockData.currentCandle));
          }
        });
      }
    }
  }
}

// Start data generation for all stocks
availableStocks.forEach(symbol => {
  setInterval(() => generateCandlestickData(symbol), 1000); // Update every second
  console.log(`📈 Started data generation for ${symbol}`);
});

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
          
          // Send current candle if available
          const stockData = candlestickData.get(currentStock);
          if (stockData && stockData.currentCandle) {
            ws.send(JSON.stringify(stockData.currentCandle));
          }
        } else {
          console.log(`❌ Invalid stock symbol: ${currentStock}`);
        }
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('👤 Client disconnected');
    // Clean up on disconnect
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
    console.error('❌ WebSocket error:', error);
  });
});

// Log server stats every 30 seconds
setInterval(() => {
  let totalClients = 0;
  stockRooms.forEach((clients, symbol) => {
    totalClients += clients.length;
    if (clients.length > 0) {
      console.log(`📊 ${symbol}: ${clients.length} clients`);
    }
  });
  console.log(`📈 Total clients connected: ${totalClients}`);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  wss.close();
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  wss.close();
  process.exit(0);
});
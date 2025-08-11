// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

const StockChart = () => {
  const [selectedStock, setSelectedStock] = useState('JOBY');
  const [chartData, setChartData] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);
  const wsRef = useRef(null);

  // Your specified stocks
  const availableStocks = ['JOBY', 'ACHR', 'SVIX', 'UVIX', 'VXX', 'WULF'];

  // Connect to WebSocket server
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus('Connecting...');
    
    // Try to connect to WebSocket server
    try {
      const ws = new WebSocket('ws://localhost:3002');
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('Connected');
        console.log('Connected to WebSocket server');
        setChartData([]);
        
        // Subscribe to selected stock
        ws.send(JSON.stringify({
          action: 'subscribe',
          symbol: selectedStock
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Update chart with new candlestick data
        setChartData(prev => {
          const updated = [...prev, {
            time: new Date(data.timestamp).toLocaleTimeString(),
            timestamp: data.timestamp,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume
          }];
          return updated.slice(-20); // Keep last 20 candles
        });
        
        setCurrentPrice(data.close);
        setCurrentVolume(data.volume);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('Error - Server not running');
      };

      ws.onclose = () => {
        setConnectionStatus('Disconnected');
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus('Failed to connect');
    }

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [selectedStock]);

  const handleStockChange = (stock) => {
    setSelectedStock(stock);
  };

  // Custom candlestick component
  const Candlestick = (props) => {
    const { payload, x, y, width, height } = props;
    if (!payload) return null;

    const { open, high, low, close } = payload;
    const isGreen = close >= open;
    const color = isGreen ? '#10b981' : '#ef4444';
    
    const candleWidth = Math.max(width * 0.6, 2);
    const centerX = x + width / 2;
    
    // Simple positioning for demo
    const range = Math.max(high - low, 0.01);
    const heightScale = height / range;
    
    const highY = y + (high - Math.max(open, close)) * heightScale;
    const lowY = y + height - (Math.min(open, close) - low) * heightScale;
    const openY = y + (high - open) * heightScale;
    const closeY = y + (high - close) * heightScale;

    return (
      <g>
        {/* High-Low line */}
        <line
          x1={centerX}
          y1={Math.min(openY, closeY)}
          x2={centerX}
          y2={Math.max(openY, closeY)}
          stroke={color}
          strokeWidth={1}
        />
        {/* Open-Close rectangle */}
        <rect
          x={centerX - candleWidth / 2}
          y={Math.min(openY, closeY)}
          width={candleWidth}
          height={Math.abs(closeY - openY) || 1}
          fill={color}
          stroke={color}
          strokeWidth={1}
        />
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="tooltip">
          <p><strong>Time: {label}</strong></p>
          <p style={{color: '#10b981'}}>Open: ${data.open?.toFixed(2)}</p>
          <p style={{color: '#3b82f6'}}>High: ${data.high?.toFixed(2)}</p>
          <p style={{color: '#ef4444'}}>Low: ${data.low?.toFixed(2)}</p>
          <p style={{color: '#8b5cf6'}}>Close: ${data.close?.toFixed(2)}</p>
          <p style={{color: '#6b7280'}}>Volume: {data.volume?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="app-container">
      <div className="main-card">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <h1>Real-time Stock Charts</h1>
            <p>Candlestick Price & Volume Charts</p>
          </div>
          <div className="header-right">
            <div className={`status-badge ${connectionStatus.toLowerCase().replace(/[^a-z]/g, '')}`}>
              <div className="status-dot"></div>
              {connectionStatus}
            </div>
          </div>
        </div>

        {/* Stock Selection */}
        <div className="stock-selection">
          <label>Select Stock Symbol:</label>
          <div className="stock-buttons">
            {availableStocks.map(stock => (
              <button
                key={stock}
                onClick={() => handleStockChange(stock)}
                className={`stock-btn ${selectedStock === stock ? 'active' : ''}`}
              >
                {stock}
              </button>
            ))}
          </div>
        </div>

        {/* Current Stats */}
        <div className="stats-grid">
          <div className="stat-card price-card">
            <div className="stat-left">
              <h2>{selectedStock}</h2>
              <p>Current Price</p>
            </div>
            <div className="stat-right">
              <div className="stat-value price-value">
                ${currentPrice.toFixed(2)}
              </div>
              <div className="stat-label">Live</div>
            </div>
          </div>
          
          <div className="stat-card volume-card">
            <div className="stat-left">
              <h3>Volume</h3>
              <p>Current Candle</p>
            </div>
            <div className="stat-right">
              <div className="stat-value volume-value">
                {currentVolume.toLocaleString()}
              </div>
              <div className="stat-label">Shares</div>
            </div>
          </div>
        </div>

        {/* Price Chart */}
        <div className="chart-container">
          <h3>{selectedStock} - Candlestick Price Chart</h3>
          
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey={(data) => [data.low, data.open, data.close, data.high]}
                  shape={<Candlestick />}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading-state">
              <div className="loading-content">
                <div className="loading-text">Waiting for WebSocket connection...</div>
                <div className="loading-subtitle">Status: {connectionStatus}</div>
                {connectionStatus.includes('Error') && (
                  <div className="error-help">
                    <p>Make sure the WebSocket server is running:</p>
                    <code>node server/server.js</code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Volume Chart */}
        <div className="chart-container">
          <h3>{selectedStock} - Volume Chart</h3>
          
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666"
                  fontSize={12}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="#666"
                  fontSize={12}
                  tickFormatter={(value) => `${(value / 1000).toFixed(1)}K`}
                />
                <Tooltip 
                  formatter={(value) => [value.toLocaleString(), 'Volume']}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Bar 
                  dataKey="volume" 
                  fill="#8884d8"
                  stroke="#6366f1"
                  strokeWidth={1}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading-state">
              <div className="loading-content">
                <div className="loading-text">Waiting for volume data...</div>
                <div className="loading-subtitle">Preparing volume chart for {selectedStock}</div>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="info-section">
          <p>• Charts show last 20 candlesticks for optimal performance</p>
          <p>• WebSocket connection to: ws://localhost:3002</p>
          <p>• Status: {connectionStatus}</p>
        </div>
      </div>
    </div>
  );
};

export default StockChart;
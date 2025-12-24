// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 提供静态文件服务
app.use(express.static('public'));
app.use(express.json());

// 存储最新的传感器数据和历史数据
let latestData = {};
let historyData = []; // 使用数组存储历史数据

// 创建真实的 MQTT 客户端
const mqtt = require('mqtt');

// 从环境变量读取配置，如果没有则使用默认值
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.TOPIC || 'iot/demo/temperature';
const MQTT_USERNAME = process.env.MQTT_USERNAME || undefined;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || undefined;

const client = mqtt.connect(MQTT_URL, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
});

client.on('connect', () => {
  console.log(`[SERVER] Connected to MQTT broker at ${MQTT_URL}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('[SERVER] Failed to subscribe to topic:', err.message);
    } else {
      console.log(`[SERVER] Subscribed to topic: ${MQTT_TOPIC}`);
    }
  });
});

client.on('error', (err) => {
  console.error('[SERVER] MQTT connection error:', err.message);
});

client.on('close', () => {
  console.log('[SERVER] MQTT connection closed');
});

client.on('reconnect', () => {
  console.log('[SERVER] MQTT reconnecting...');
});

client.on('message', (topic, message) => {
  try {
    // 解析来自 MQTT 的消息
    const rawData = JSON.parse(message.toString());
    
    // 转换数据格式以匹配前端期望的格式
    const data = {
      deviceId: rawData.deviceId,
      temperature: rawData.temperature,
      humidity: rawData.humidity,
      co2: rawData.co2,  // 新增 CO2 浓度
      ph: rawData.ph,    // 新增 pH 值
      timestamp: rawData.ts ? new Date(rawData.ts).toISOString() : new Date().toISOString()
    };
    
    latestData = data;
    
    console.log('[SERVER] Received MQTT message:', data);
    
    // 向所有连接的客户端广播数据
    io.emit('sensorData', data);
    
    // 将数据保存到历史数据数组
    historyData.unshift({
      id: historyData.length + 1,
      device_id: data.deviceId || 'unknown',
      temperature: parseFloat(data.temperature),
      humidity: parseFloat(data.humidity),
      co2: parseFloat(data.co2),  // 新增 CO2 浓度
      ph: parseFloat(data.ph),    // 新增 pH 值
      timestamp: data.timestamp
    });
    
    // 限制历史数据数量为1000条
    if (historyData.length > 1000) {
      historyData = historyData.slice(0, 1000);
    }
    
    console.log(`[SERVER] Data saved to memory, total records: ${historyData.length}`);
  } catch (err) {
    console.error('[SERVER] Error parsing MQTT message:', err.message);
  }
});

// API 路由：获取历史数据
app.get('/api/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const deviceId = req.query.deviceId;
    
    let filteredData = historyData;
    
    if (deviceId) {
      filteredData = historyData.filter(item => item.device_id === deviceId);
    }
    
    const result = filteredData.slice(0, limit);
    res.json({
      message: 'success',
      data: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 路由：获取统计信息
app.get('/api/stats', (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    
    let filteredData = historyData;
    
    if (deviceId) {
      filteredData = historyData.filter(item => item.device_id === deviceId);
    }
    
    if (filteredData.length === 0) {
      return res.json({
        message: 'success',
        data: {
          min_temperature: null,
          max_temperature: null,
          avg_temperature: null,
          min_humidity: null,
          max_humidity: null,
          avg_humidity: null,
          min_co2: null,
          max_co2: null,
          avg_co2: null,
          min_ph: null,
          max_ph: null,
          avg_ph: null,
          total_records: 0
        }
      });
    }
    
    const temperatures = filteredData.map(item => item.temperature);
    const humidities = filteredData.map(item => item.humidity);
    const co2s = filteredData.map(item => item.co2);        // 新增 CO2 浓度
    const phs = filteredData.map(item => item.ph);          // 新增 pH 值
    
    const result = {
      min_temperature: Math.min(...temperatures),
      max_temperature: Math.max(...temperatures),
      avg_temperature: temperatures.reduce((a, b) => a + b, 0) / temperatures.length,
      min_humidity: Math.min(...humidities),
      max_humidity: Math.max(...humidities),
      avg_humidity: humidities.reduce((a, b) => a + b, 0) / humidities.length,
      min_co2: Math.min(...co2s),                           // 新增 CO2 统计
      max_co2: Math.max(...co2s),                           // 新增 CO2 统计
      avg_co2: co2s.reduce((a, b) => a + b, 0) / co2s.length, // 新增 CO2 统计
      min_ph: Math.min(...phs),                             // 新增 pH 统计
      max_ph: Math.max(...phs),                             // 新增 pH 统计
      avg_ph: phs.reduce((a, b) => a + b, 0) / phs.length,  // 新增 pH 统计
      total_records: filteredData.length
    };
    
    res.json({
      message: 'success',
      data: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 路由：按时间段查询数据
app.get('/api/history/range', (req, res) => {
  try {
    const start = new Date(req.query.start).getTime();
    const end = new Date(req.query.end).getTime();
    const deviceId = req.query.deviceId;
    
    let filteredData = historyData.filter(item => {
      const itemTime = new Date(item.timestamp).getTime();
      return itemTime >= start && itemTime <= end;
    });
    
    if (deviceId) {
      filteredData = filteredData.filter(item => item.device_id === deviceId);
    }
    
    res.json({
      message: 'success',
      data: filteredData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 路由：获取实时数据
app.get('/api/realtime', (req, res) => {
  res.json({
    message: 'success',
    data: latestData
  });
});

io.on('connection', (socket) => {
  console.log('[SERVER] A user connected');
  
  // 发送最新的数据给新连接的客户端
  if (Object.keys(latestData).length > 0) {
    socket.emit('sensorData', latestData);
  }
  
  socket.on('disconnect', () => {
    console.log('[SERVER] A user disconnected');
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[SERVER] Web server running on port ${PORT}`);
  console.log(`[SERVER] MQTT configuration:`);
  console.log(`  - URL: ${MQTT_URL}`);
  console.log(`  - Topic: ${MQTT_TOPIC}`);
  console.log(`  - Username: ${MQTT_USERNAME ? 'Provided' : 'None'}`);
});
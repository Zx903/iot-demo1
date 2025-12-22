// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 提供静态文件服务
app.use(express.static('public'));

// 存储最新的传感器数据
let latestData = {};

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
      timestamp: rawData.ts ? new Date(rawData.ts).toISOString() : new Date().toISOString()
    };
    
    latestData = data;
    
    console.log('[SERVER] Received MQTT message:', data);
    
    // 向所有连接的客户端广播数据
    io.emit('sensorData', data);
  } catch (err) {
    console.error('[SERVER] Error parsing MQTT message:', err.message);
  }
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
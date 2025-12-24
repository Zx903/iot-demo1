require('dotenv').config();
const mqtt = require('mqtt');

const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
const topic = process.env.TOPIC || 'iot/demo/temperature';

const client = mqtt.connect(url, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
});

client.on('connect', () => {
  console.log('[PUB] Connected:', url);

  // 模拟设备上报传感器数据
  setInterval(() => {
    const data = {
      deviceId: 'sensor-001',
      ts: Date.now(),
      temperature: (20 + Math.random() * 5).toFixed(2), // 温度范围 20-25°C
      humidity: (40 + Math.random() * 10).toFixed(2),   // 湿度范围 40-50%
      co2: (400 + Math.random() * 200).toFixed(2),      // CO2浓度范围 400-600 ppm
      ph: (6.0 + Math.random() * 2).toFixed(2)          // pH值范围 6.0-8.0
    };
    const payload = JSON.stringify(data);
    client.publish(topic, payload, { qos: 0 }, (err) => {
      if (err) {
        console.error('[PUB] Publish error:', err.message);
      } else {
        console.log('[PUB] Sent:', payload);
      }
    });
  }, 2000);
});

client.on('error', (err) => console.error('[PUB] Error:', err.message));
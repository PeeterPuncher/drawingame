const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    const text = message.toString(); // Üzenet szöveggé alakítása
    console.log(`Received: ${text}`);
    // Küldjük el az üzenetet minden kliensnek
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text); // Csak szöveges adatot küldünk
      }
    });
  });
  

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const rooms = {}; // { roomId: Set of WebSocket clients }

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    if (data.type === 'create-room') {
      const roomId = uuidv4(); // Generate a unique room ID
      rooms[roomId] = new Set();
      ws.roomId = roomId;
      rooms[roomId].add(ws);
      ws.send(JSON.stringify({ type: 'room-created', roomId }));
    } 
    
    else if (data.type === 'join-room') {
      const { roomId } = data;
      if (rooms[roomId]) {
        ws.roomId = roomId;
        rooms[roomId].add(ws);
        ws.send(JSON.stringify({ type: 'room-joined', roomId }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      }
    } 
    
    else if (data.type === 'message') {
      const { roomId, text } = data;
      if (rooms[roomId]) {
        rooms[roomId].forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'message', text }));
          }
        });
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].delete(ws);
      if (rooms[ws.roomId].size === 0) {
        delete rooms[ws.roomId];
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


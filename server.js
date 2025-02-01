const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const rooms = {}; // { roomId: { name, clients: Set } }

function generateRoomCode() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

function updateLobby() {
  const roomList = Object.entries(rooms).map(([roomId, room]) => ({
    roomId,
    name: room.name,
    players: room.clients.size
  }));

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'update-lobby', rooms: roomList }));
    }
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'create-room') {
      let roomId;
      do {
        roomId = generateRoomCode();
      } while (rooms[roomId]);

      rooms[roomId] = { name: data.roomName || `Room ${roomId}`, clients: new Set() };
      ws.roomId = roomId;
      rooms[roomId].clients.add(ws);

      ws.send(JSON.stringify({ type: 'room-created', roomId }));
      updateLobby();
    } 
    
    else if (data.type === 'join-room') {
      const { roomId } = data;
      if (rooms[roomId]) {
        ws.roomId = roomId;
        rooms[roomId].clients.add(ws);
        ws.send(JSON.stringify({ type: 'room-joined', roomId }));
        updateLobby();
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      }
    } 
    
    else if (data.type === 'message') {
      const { roomId, text, user } = data;
      if (rooms[roomId]) {
        rooms[roomId].clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'message', user, text }));
          }
        });
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].clients.delete(ws);
      if (rooms[ws.roomId].clients.size === 0) {
        delete rooms[ws.roomId];
      }
      updateLobby();
    }
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

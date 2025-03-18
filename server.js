const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const baseUrl = 'https://gamedb.alwaysdata.net';

const rooms = new Map(); // Map<roomCode, Set<ws>>
const roomTimeouts = new Map(); // Map<roomCode, timeout>
const pendingLeaves = new Map(); // Map<userId, timeout>

app.use(express.static('public'));

function generateRoomCode() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Message received from client:', data);

    // Handle reconnection
    if (data.type === 'reconnect') {
      const { userId, roomCode } = data;
      if (pendingLeaves.has(userId)) {
        clearTimeout(pendingLeaves.get(userId)); // Cancel pending leave
        pendingLeaves.delete(userId);
        console.log(`User ${userId} reconnected, canceling leave`);
      }
      return;
    }

    // Set the page property based on the initial message
    if (data.type === 'set-page') {
      ws.page = data.page;
      return;
    }

    if (data.type === 'get-lobby') {
      getRooms();
    } else if (data.type === 'create-room') {
      const roomCode = generateRoomCode();
      const username = data.username;

      fetchData('create-room', { room_code: roomCode, room_name: data.roomName })
        .then((responseData) => {
          rooms.set(roomCode, new Set());
          console.log(`Created room ${roomCode}`);
          ws.send(JSON.stringify({ type: 'room-created', data: { ...responseData, roomCode } }));
          getRooms();
        });
    } else if (data.type === 'join-room') {
      const roomCode = data.room_code;
      const username = data.username;

      // Cancel scheduled deletion if the room is being rejoined
      if (roomTimeouts.has(roomCode)) {
        clearTimeout(roomTimeouts.get(roomCode));
        roomTimeouts.delete(roomCode);
      }

      // First persist to database
      fetchData('join-room', { room_code: roomCode, user_name: username })
        .then((responseData) => {
          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
          }

          rooms.get(roomCode).add(ws);
          ws.roomCode = roomCode;
          ws.username = username;
          ws.hasJoinedRoom = true;
          ws.userId = data.userId || generateUserId(); // Assign unique user ID

          // Broadcast to room
          rooms.get(roomCode).forEach(client => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({
                type: 'joined-room',
                user: username
              }));
            }
          });
          getRooms();

          // Send confirmation
          ws.send(JSON.stringify({
            type: 'room-joined',
            data: { room_code: roomCode, username: username }
          }));
        })
        .catch((error) => {
          console.error('Join-room failed:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to join room: ' + error.message
          }));
        });
    } else if (data.type === 'message') {
      const roomCode = ws.roomCode;
      const username = data.username;
      const text = data.text;

      if (roomCode && rooms.has(roomCode)) {
        const roomClients = rooms.get(roomCode);
        roomClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'message',
              data: { text: text, username: username }
            }));
          }
        });
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'You are not in a room.' }));
      }
    } else if (data.type === 'save-drawing') {
      const imageData = data.imageFile;

      fetchData('save-drawing', { image: imageData })
        .then((responseData) => {
          console.log('Drawing saved:', responseData);
          ws.send(JSON.stringify({ type: 'save-drawing', data: imageData }));
        })
        .catch((error) => {
          console.error('Fetch error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        });
    } else if (data.type === 'leave-room') {
      handleLeaveRoom(ws, data.room_code, data.username);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected. Room code: ${ws.roomCode}, Username: ${ws.username}, Has joined room: ${ws.hasJoinedRoom}`);

    if (!ws.hasJoinedRoom) {
      console.log('Client disconnected (not in a room)');
      return;
    }

    const roomCode = ws.roomCode;
    const username = ws.username;
    const userId = ws.userId;

    if (rooms.has(roomCode)) {
      const roomClients = rooms.get(roomCode);
      roomClients.delete(ws);

      // Schedule potential leave action
      const timeoutId = setTimeout(() => {
        handleActualLeave(roomCode, username);
      }, 5000); // 5-second grace period

      pendingLeaves.set(userId, timeoutId);
    }

    console.log('Client disconnected');
  });
});

function handleActualLeave(roomCode, username) {
  if (rooms.has(roomCode)) {
    const roomClients = rooms.get(roomCode);

    fetchData('leave-room', { user_name: username })
      .then(() => {
        roomClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user-left',
              data: { user: username }
            }));
          }
        });

        if (roomClients.size === 0) {
          rooms.delete(roomCode);
          fetchData('delete-room', { room_code: roomCode })
            .then(() => {
              console.log(`Room ${roomCode} deleted after grace period`);
              getRooms();
            })
            .catch(console.error);
        }
      })
      .catch(console.error);
  }
}

function generateUserId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.get('/canvas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rajzolas/rajzuj.html')));

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

async function getRooms() {
  fetchData('get-lobby')
    .then((responseData) => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'update-lobby', data: responseData }));
        }
      });
    })
    .catch((error) => {
      console.error('Fetch error:', error);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'error', message: error.message }));
        }
      });
    });
}

async function fetchData(action, body = {}) {
  const url = new URL('server.php', baseUrl).toString();
  const payload = JSON.stringify({ action, ...body });

  if (action !== "save-drawing") {
    console.log("Sending payload to PHP:", payload);
  } else {
    console.log("Sending drawing to PHP");
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
      agent: new https.Agent({ rejectUnauthorized: false }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data;
    } catch (error) {
      throw new Error(`Invalid JSON response: ${text}`);
    }
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}
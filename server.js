const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const https = require('https');
const { text } = require('stream/consumers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const baseUrl = 'https://gamedb.alwaysdata.net';

const rooms = new Map(); // Map<roomCode, Set<ws>>
const usernames = new Map(); // Map<ws, username>
const roomTimeouts = new Map(); // Map<roomCode, timeout>

app.use(express.static('public'));

function generateRoomCode() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Message received from client:', data);

    ////////////////////////////////////////////////////////////////////////////////////////////
    if (data.type === 'get-lobby') {
      fetchData('get-lobby')
        .then((responseData) => {
          ws.send(JSON.stringify({ type: 'update-lobby', data: responseData }));
        })
        .catch((error) => {
          console.error('Fetch error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        });
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'create-room') {
      const roomCode = generateRoomCode();
      const username = data.username;
    
      fetchData('create-room', { room_code: roomCode, room_name: data.roomName })
        .then((responseData) => {
          rooms.set(roomCode, new Set());
          ws.roomCode = roomCode; // Set the room code
          ws.username = username; // Set the username
          ws.hasJoinedRoom = false; // Do not set hasJoinedRoom here
    
          console.log(`User ${username} created room ${roomCode}`); // Log the action
          ws.send(JSON.stringify({ type: 'room-created', data: { ...responseData, roomCode, username } }));

          fetchData('join-room', { room_code: roomCode, user_name: username })
          .then((responseData) =>
          {
            rooms.get(roomCode).add(ws); // Add the client to the room
            ws.roomCode = roomCode; // Set the room code
            ws.username = username; // Set the username
            ws.hasJoinedRoom = true; // Mark the user as having joined the room
            ws.send(JSON.stringify({ type: 'room-joined', data: responseData }));
          })
          .catch((error) => {
            console.error('Fetch error:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          });
        })
        .catch((error) => {
          console.error('Fetch error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        });
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'join-room') {
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
          // Only add to memory after successful DB update
          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
          }
    
          rooms.get(roomCode).add(ws);
          ws.roomCode = roomCode;
          ws.username = username;
          ws.hasJoinedRoom = true;
    
          // Broadcast to room
          rooms.get(roomCode).forEach(client => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({
                type: 'joined-room',
                user: username
              }));
            }
          });
    
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
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'message') {
      // Broadcast the message to all clients in the same room
      const roomCode = ws.roomCode;
      const username = data.username;
      const text = data.text;

      if (roomCode && rooms.has(roomCode)) {
        const roomClients = rooms.get(roomCode);
        roomClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'message', 
              data: {text: text, username: username},}));
          }
        });
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'You are not in a room.' }));
      }
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'leave-room') {
      const roomCode = data.room_code;
      const username = data.username;
    
      if (rooms.has(roomCode)) {
        const roomClients = rooms.get(roomCode);
        roomClients.delete(ws); // Remove the client
    
        // Broadcast that the user left
        roomClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user-left',
              data: { room_code: roomCode, user: username }
            }));
          }
        });
    
        // Delete room if empty
        if (roomClients.size == 0) {
          const timeoutId = setTimeout(() => {
            rooms.delete(roomCode);
            fetchData('delete-room', { room_code: roomCode })
              .then(() => console.log(`Room ${roomCode} deleted after grace period`))
              .catch(console.error);
          }, 3000); // 3-second grace period
  
          roomTimeouts.set(roomCode, timeoutId);
        }
      }
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
   
  });

  ws.on('close', () => {
    console.log(`Client disconnected. Room code: ${ws.roomCode}, Username: ${ws.username}, Has joined room: ${ws.hasJoinedRoom}`);

    /*if (!ws.hasJoinedRoom) {
      console.log('Client disconnected (not in a room)');
      return;
    }*/

    const roomCode = ws.roomCode;
    const username = ws.username;

    if (rooms.has(roomCode)) {
      const roomClients = rooms.get(roomCode);
      roomClients.delete(ws);

      // Notify remaining users
      fetchData('leave-room', { user_name: username })
        .then((responseData) => {
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'user-disconnected', data: { user: username } }));
            }
          });
        })
        .catch(console.error);

      // Schedule room deletion only if empty
      if (roomClients.size == 0) {
        const timeoutId = setTimeout(() => {
          rooms.delete(roomCode);
          fetchData('delete-room', { room_code: roomCode })
            .then(() => console.log(`Room ${roomCode} deleted after grace period`))
            .catch(console.error);
        }, 3000); // 3-second grace period

        roomTimeouts.set(roomCode, timeoutId);
      }
    }

    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.get('/canvas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rajzolas/rajzuj.html')));

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

async function fetchData(action, body = {}) {
  const url = new URL('server.php', baseUrl).toString();
  const payload = JSON.stringify({ action, ...body });

  console.log("Sending payload to PHP:", payload); // Log the payload

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

    const text = await response.text(); // Read the response as text first
    try {
      const data = JSON.parse(text); // Try to parse it as JSON
      return data;
    } catch (error) {
      throw new Error(`Invalid JSON response: ${text}`);
    }
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}
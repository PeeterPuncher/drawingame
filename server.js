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
const usernames = new Map(); // Map<ws, username>

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
          .then((responseData) => {
            waitFor(1000); // Wait for 1 second
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
      // Join a room and send the room code to the client
      const roomCode = data.room_code;
      const username = data.username;
    
      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, new Set()); // Create the room if it doesn't exist
      }
    
      fetchData('join-room', { room_code: roomCode, user_name: username })
        .then((responseData) => {
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
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'message') {
      // Broadcast the message to all clients in the same room
      const roomCode = ws.roomCode;
      if (roomCode && rooms.has(roomCode)) {
        const roomClients = rooms.get(roomCode);
        roomClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'message', data: data.message }));
          }
        });
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'You are not in a room.' }));
      }
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
  });

  ws.on('close', () => {
    console.log(`Client disconnected. Room code: ${ws.roomCode}, Username: ${ws.username}, Has joined room: ${ws.hasJoinedRoom}`); // Log the state
  
    if (!ws.hasJoinedRoom) {
      console.log('Client disconnected (not in a room)');
      return;
    }
  
    const roomCode = ws.roomCode;
    const username = ws.username;
  
    if (rooms.has(roomCode)) {
      const roomClients = rooms.get(roomCode);
      roomClients.delete(ws);
  
      fetchData('leave-room', { user_name: username })
        .then((responseData) => {
          roomClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'user-left', data: { username, ...responseData } }));
            }
          });
        })
        .catch((error) => {
          console.error('Fetch error:', error);
        });
  
      if (roomClients.size === 0) {
        rooms.delete(roomCode);
  
        fetchData('delete-room', { room_code: roomCode })
          .then((responseData) => {
            console.log('Room deleted:', roomCode);
          })
          .catch((error) => {
            console.error('Fetch error:', error);
          });
      }
    }
    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

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
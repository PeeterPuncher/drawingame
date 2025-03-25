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
const port = process.env.PORT || 4000;

const rooms = new Map(); // Map<roomCode, Set<ws>>
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

    // Set the page property based on the initial message
    if (data.type === 'set-page') {
      ws.page = data.page;
      return;
    }

    if (data.type === 'get-lobby') {
      getRooms();
    }
    else if (data.type === 'create-room') {
      const roomCode = generateRoomCode();
      const username = data.username;
    
      fetchData('create-room', { room_code: roomCode, room_name: data.roomName })
        .then((responseData) => {
          rooms.set(roomCode, new Set());
    
          console.log(`Created room ${roomCode}`); // Log the action
          ws.send(JSON.stringify({ type: 'room-created', data: { ...responseData, roomCode} }));
          getRooms();
        });
    }
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
    }
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
    else if (data.type === 'save-drawing') {
      const imageData = data.imageFile;
    
      fetchData('save-drawing', { image: imageData })
        .then((responseData) => {
          console.log('Drawing saved:', responseData);
          
          // Broadcast the saved drawing to other clients in the room
          ws.send(JSON.stringify({ type: 'save-drawing', data: imageData }));
        })
        .catch((error) => {
          console.error('Fetch error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        });
    }
////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'leave-room') {
      const roomCode = data.room_code;
      const username = data.username;
    
      if (rooms.has(roomCode)) {
        const roomClients = rooms.get(roomCode);
        roomClients.delete(ws); // Remove the client
    
        // Broadcast that the user left after a grace period
        const timeoutId = setTimeout(() => {
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
            const deleteTimeoutId = setTimeout(() => {
              rooms.delete(roomCode);
              fetchData('delete-room', { room_code: roomCode })
                .then(() => {
                  console.log(`Room ${roomCode} deleted after grace period`);
                  getRooms();
                })
                .catch(console.error);
            }, 3000); // 3-second grace period
    
            roomTimeouts.set(roomCode, deleteTimeoutId);
          } else {
            getRooms();
          }
        }, 3000); // 3-second grace period
    
        roomTimeouts.set(roomCode, timeoutId);
      }
    }
  });

////////////////////////////////////////////////////////////////////////////////////////////

ws.on('close', () => {
  console.log(`Client disconnected. Room code: ${ws.roomCode}, Username: ${ws.username}, Has joined room: ${ws.hasJoinedRoom}`);

  if (!ws.hasJoinedRoom) {
    console.log('Client disconnected (not in a room)');
    return;
  }

  const roomCode = ws.roomCode;
  const username = ws.username;

  if (rooms.has(roomCode)) {
    const roomClients = rooms.get(roomCode);
    roomClients.delete(ws);

    // Notify remaining users after a grace period
    const timeoutId = setTimeout(() => {
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
        const deleteTimeoutId = setTimeout(() => {
          rooms.delete(roomCode);
          fetchData('delete-room', { room_code: roomCode })
            .then(() => {
              console.log(`Room ${roomCode} deleted after grace period`);
              getRooms();
            })
            .catch(console.error);
        }, 3000); // 3-second grace period

        roomTimeouts.set(roomCode, deleteTimeoutId);
      } else {
        getRooms();
      }
    }, 3000); // 3-second grace period

    roomTimeouts.set(roomCode, timeoutId);
  }

  console.log('Client disconnected');
});

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

  if (action != "save-drawing")
  {
    console.log("Sending payload to PHP:", payload); // Log the payload
  }
  else
  {
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
}});
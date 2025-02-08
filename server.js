const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const baseUrl = 'https://gamedb.alwaysdata.net';

rooms = new Map(); // Map<roomCode, Set<ws>>
const usernames = new Map(); // Map<ws, username>

app.use(express.static('public'));

function generateRoomCode()
{
  return Math.floor(10000 + Math.random() * 90000).toString();
}

wss.on('connection', (ws) =>
{
  console.log('New client connected');

  ws.on('message', (message) =>
  {
    const data = JSON.parse(message);
    console.log('Message received from client:', data);

////////////////////////////////////////////////////////////////////////////////////////////

    if (data.type == 'get-lobby')
    {
      fetchData('get-lobby')
      .then((responseData) => 
      {
        ws.send(JSON.stringify({ type: 'update-lobby', data: responseData }));
      })
      .catch((error) => 
      {
        console.error('Fetch error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      });
    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'create-room')
    {
      // Create a new room and send the room code to the client
      const roomCode = generateRoomCode();

      fetchData('create-room', { room_code: roomCode, room_name: data.roomName })
      .then((responseData) => 
      {
        ws.send(JSON.stringify({ type: 'room-created', data: responseData }));
      })
      .catch((error) => 
      {
        console.error('Fetch error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      });
    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'join-room')
    {
      // Join a room and send the room code to the client

      const roomCode = data.room_code;
      const username = data.username;
    
      if (!rooms.has(roomCode))
      {
        rooms.set(roomCode, new Set());
      }

      fetchData('join-room', { room_code: roomCode, user_name: username })
      .then((responseData) => 
      {
        rooms.get(roomCode).add(ws);
        ws.send(JSON.stringify({ type: 'room-joined', responseData }));
      })
      .catch((error) => 
      {
        console.error('Fetch error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      });
    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'message')
    {
      // Broadcast the message to all clients in the same room

    }

  });

  ws.on('close', () => {
    const roomCode = ws.roomCode;
    const username = ws.username; // Assuming you store the username in the WebSocket object
  
    if (roomCode && rooms.has(roomCode)) {
      const roomClients = rooms.get(roomCode);
      roomClients.delete(ws); // Remove the client from the room
  
      // Notify the server that the client has left the room
      fetchData('leave-room', { room_code: roomCode, user_name: username })
        .then((responseData) => {
          // Broadcast to remaining clients in the room that a user has left
          roomClients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
              client.send(JSON.stringify({ type: 'user-left', data: { username: username, ...responseData } }));
            }
          });
        })
        .catch((error) => {
          console.error('Fetch error:', error);
        });
  
      // If the room is empty, delete it
      if (roomClients.size === 0) {
        rooms.delete(roomCode); // Remove the room from the in-memory map
  
        // Notify the server that the room has been deleted
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
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
    agent: new (require('https').Agent)({ rejectUnauthorized: false }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Response is not JSON');
  }

  return response.json();
}
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const baseUrl = 'https://gamedb.free.nf';

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
      fetch(new URL('server.php', baseUrl).toString(), 
      {
        method: 'POST', // or 'GET' if you don't need to send a body
        headers: 
        {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          {
            action: 'get-lobby'
        })
      })
      .then(response => 
      {
        if (!response.ok)
        {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json'))
        {
          throw new Error('Response is not JSON');
        }
        return response.json();
      })
      .then(data =>
      {
          // Send the lobby data to the client
          ws.send(JSON.stringify({ type: 'update-lobby', data: data }));
      });
    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'create-room')
    {
      // Create a new room and send the room code to the client
      const roomCode = generateRoomCode();

      fetch(new URL('server.php', baseUrl).toString(), 
      {
        method: 'POST', // or 'GET' if you don't need to send a body
        headers: 
        {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          {
            action: 'create-room',
            room_code: roomCode,
            room_name: data.roomName
        })
      })
      .then(response => 
      {
        if (!response.ok)
        {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json'))
        {
          throw new Error('Response is not JSON');
        }
        return response.json();
      })
      .then(data =>
      {
          // Send the lobby data to the client
          ws.send(JSON.stringify({ type: 'room-created', data: data }));
      });
    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'join-room')
    {
      // Join a room and send the room code to the client

    }

////////////////////////////////////////////////////////////////////////////////////////////

    else if (data.type == 'message')
    {
      // Broadcast the message to all clients in the same room

    }

  });

  ws.on('close', () =>
  {
    // Remove the client from the room
  });
});


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

server.listen(3000, () => console.log('Server running on http://localhost:3000'));

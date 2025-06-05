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
const port = 3000;

server.listen(port, () => {
  console.log(`Server running on 3 redbulls and prayers, please be patient...`);
});

const rooms = new Map(); // Map<roomCode, Set<ws>>
const roomPlayers = new Map(); // Map<roomCode, Array<{name, userId, ready}>>
const roomTimeouts = new Map(); // Map<roomCode, timeout>
const roomHosts = new Map(); // Map<roomCode, userId>
const roomUploads = new Map(); // Map<roomCode, Set<userId>>
const roomWords = new Map(); // Map<roomCode, word>
const roomRounds = new Map(); // Map<roomCode, roundNumber>
const roomStarted = new Map(); // Map<roomCode, boolean>

app.use(express.static('public'));

function generateRoomCode() {
  let roomCode = Math.floor(10000 + Math.random() * 90000).toString();
  while (rooms.has(roomCode))
  {
    roomCode = Math.floor(10000 + Math.random() * 90000).toString();
  }
  return roomCode;
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    console.log('Message received from client:', data);

    // Set the page property based on the initial message
    if (data.type === 'set-page') {
      ws.page = data.page;
      return;
    }

    if (data.type === 'get-lobby') {
      try {
        // Properly await the fetchData call
        const responseData = await fetchData('get-lobby');
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'update-lobby', 
            data: responseData 
          }));
        }
      } catch (error) {
        console.error('Lobby fetch error:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: error.message || 'Failed to fetch lobby data'
          }));
        }
      }
    }
    else if (data.type === 'create-room') {
      const roomCode = generateRoomCode();
      const username = data.username;

      fetchData('create-room', { room_code: roomCode, room_name: data.roomName })
        .then((responseData) => {
          rooms.set(roomCode, new Set());
          roomStarted.set(roomCode, false); // <-- Mark as not started
    
          console.log(`Created room ${roomCode}`);
          ws.send(JSON.stringify({ type: 'room-created', data: { ...responseData, roomCode} }));
          getRooms();
        });
    }
    else if (data.type === 'join-room') {
      const roomCode = data.room_code;
      const username = data.username;
      const userId = String(data.userId);

      // --- Prevent join if room has started ---
      if (roomStarted.get(roomCode)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Game has already started in this room. You cannot join now.'
        }));
        return;
      }

      // Cancel scheduled deletion if the room is being rejoined
      if (roomTimeouts.has(roomCode)) {
        clearTimeout(roomTimeouts.get(roomCode));
        roomTimeouts.delete(roomCode);
      }

      // First persist to database
      fetchData('join-room', { room_code: roomCode, user_name: username })
        .then(async (responseData) => {
          // Initialize room if it doesn't exist
          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
          }
          if (!roomPlayers.has(roomCode)) {
            roomPlayers.set(roomCode, []);
          }
          const roomClients = rooms.get(roomCode);

          // Remove previous client with same userId
          for (let client of roomClients) {
            if (client.userId === userId) {
              roomClients.delete(client);
              break;
            }
          }

          // Add the new connection to the room
          roomClients.add(ws);
          ws.roomCode = roomCode;
          ws.username = username;
          ws.userId = userId;
          ws.hasJoinedRoom = true;

          // --- HOST LOGIC ---
          if (!roomHosts.has(roomCode) || roomHosts.get(roomCode) == null) {
            roomHosts.set(roomCode, userId); // always string
          }

          // --- PLAYER LIST LOGIC (simplified, just for display) ---
          let arr = Array.from(roomClients).map(client => ({
            name: client.username,
            userId: String(client.userId)
          }));
          roomPlayers.set(roomCode, arr);

          // Broadcast player list and host info
          broadcastRoomPlayers(roomCode);

          // Broadcast to room (nincs szükség, hogy a saját reconnect üzenetét is elküldjük, de itt lehetőség van értesítésre)
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client !== ws) {
              client.send(JSON.stringify({
                type: 'joined-room',
                user: username
              }));
            }
          });
          getRooms();

          // Send confirmation to the reconnecting client
          ws.send(JSON.stringify({
            type: 'room-joined',
            data: { room_code: roomCode, username: username, hostId: String(roomHosts.get(roomCode)) }
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
    else if (data.type == 'update-lobby')
      {
        roomList.innerHTML = '';
        console.log(msg, data.type);
      
        // --- Render rooms: newest first ---
        const rooms = Array.isArray(msg) ? [...msg].reverse() : [];
        for (const room of rooms) {
          const roomItem = document.createElement('li');
          roomItem.className = 'list-group-item d-flex justify-content-between align-items-center';
          
          if (room.players == "0")
          {
            roomItem.innerHTML = `<span><strong>${room.name}</strong> (Players: ${room.players})</span> 
                                  <span style="color: #911e16">Room Closing</span>`;
          }
          else if (room.started) {
            roomItem.innerHTML = `<span><strong>${room.name}</strong> (Players: ${room.players})</span>
                                  <span style="color: #888; font-weight: bold;">Game Started</span>`;
          }
          else
          {
            roomItem.innerHTML = `<span><strong>${room.name}</strong> (Players: ${room.players})</span> 
                                  <button class="btn btn-success" onclick="joinRoom('${room.code}')">Join</button>`;
          }
          roomList.appendChild(roomItem);
        }
      }
////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'save-drawing') {
      const imageData = data.imageFile;
      const roomCode = data.room_code;
      const userId = String(data.userId);
      const round = roomRounds.get(roomCode) || 1;

      // Save drawing to PHP backend, pass round info
      fetchData('save-drawing', { image: imageData, room_code: roomCode, userId: userId, round: round })
        .then((responseData) => {
          console.log('Drawing saved:', responseData);

          // Track uploads per room
          if (!roomUploads.has(roomCode)) roomUploads.set(roomCode, new Set());
          roomUploads.get(roomCode).add(userId);

          // Check if all players have uploaded
          const playersArr = roomPlayers.get(roomCode) || [];
          const allUserIds = playersArr.map(p => String(p.userId));
          const uploadedUserIds = Array.from(roomUploads.get(roomCode));
          const allUploaded = allUserIds.every(uid => uploadedUserIds.includes(uid));

          if (allUploaded && allUserIds.length > 0) {
              // Notify all clients in the room to redirect, include round in URL
              const clients = rooms.get(roomCode);
              clients.forEach(client => {
                  if (client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({
                          type: 'all-images-uploaded',
                          redirectUrl: `https://gamedb.alwaysdata.net/room/${roomCode}?round=${round}`
                      }));
                  }
              });
              // Optionally clear uploads for next round
              roomUploads.set(roomCode, new Set());
          }

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
        roomClients.delete(ws);

        // Remove from player list
        if (roomPlayers.has(roomCode)) {
          const arr = roomPlayers.get(roomCode);
          const idx = arr.findIndex(p => p.name === username);
          if (idx !== -1) arr.splice(idx, 1);
        }

        // --- HOST REASSIGNMENT LOGIC ---
        if (roomHosts.has(roomCode) && String(roomHosts.get(roomCode)) === String(ws.userId)) {
          // Host left, pick a new host if any players remain
          const arr = roomPlayers.get(roomCode) || [];
          if (arr.length > 0) {
            // Assign first player as new host
            roomHosts.set(roomCode, String(arr[0].userId));
          } else {
            // No players left, remove host
            roomHosts.delete(roomCode);
          }
        }

        // Broadcast that the user left after a grace period
        const timeoutId = setTimeout(() => {
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-left',
                data: { room_code: roomCode, user: username }
              }));
              // --- Notify all clients of new host (if any) ---
              broadcastRoomPlayers(roomCode);
              getRooms(); // Update the lobby for all clients
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
            broadcastRoomPlayers(roomCode);
            // DO NOT call checkDrawingAllowed(roomCode) or send drawing-disabled!
          }
        }, 3000); // 3-second grace period
    
        roomTimeouts.set(roomCode, timeoutId);
      }
    }
    ////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'start-game') {
      const roomCode = data.room_code;
      const userId = String(data.userId);
      if (String(roomHosts.get(roomCode)) === userId) {
        // Only host can start
        // Increment round number
        let round = roomRounds.get(roomCode) || 0;
        round++;
        roomRounds.set(roomCode, round);

        roomStarted.set(roomCode, true); // <-- Mark as started

        getRooms(); // <-- Immediately update lobby for all clients

        // Fetch a random word from the database
        fetchData('get-words').then(resp => {
          let words = [];
          if (resp && resp.status === 'success' && Array.isArray(resp.data)) {
            words = resp.data;
          }
          let word = 'nincs szó';
          if (words.length > 0) {
            const randomIndex = Math.floor(Math.random() * words.length);
            word = words[randomIndex];
          }
          roomWords.set(roomCode, word);
          const clients = rooms.get(roomCode);
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'drawing-enabled', word }));
            }
          });
        }).catch(() => {
          const clients = rooms.get(roomCode);
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'drawing-enabled', word: 'hiba' }));
            }
          });
        });
      }
      return;
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

    if (roomPlayers.has(roomCode)) {
      const arr = roomPlayers.get(roomCode);
      const idx = arr.findIndex(p => p.name === username);
      if (idx !== -1) arr.splice(idx, 1);
    }

    const timeoutId = setTimeout(() => {
      // Itt lehet meghívni a "final deletion" vagy a "set offline" végleges műveletet.
      // Pl.: helyettesítsd a törlést offline állapotra, vagy csak küldj értesítést:
      fetchData('leave-room', { user_name: username })
        .then((responseData) => {
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-disconnected',
                data: { user: username }
              }));
              getRooms();
            }
          });
        })
        .catch(console.error);

      if (roomClients.size === 0) {
        const deleteTimeoutId = setTimeout(() => {
          rooms.delete(roomCode);
          fetchData('delete-room', { room_code: roomCode })
            .then(() => {
              console.log(`Room ${roomCode} deleted after grace period`);
              getRooms();
            })
            .catch(console.error);
        }, 3000); // 3 másodperces extra késleltetés

        roomTimeouts.set(roomCode, deleteTimeoutId);
      } else {
        getRooms();
        broadcastRoomPlayers(roomCode);
      }
    }, 3000); // 3 másodperces késleltetés

    roomTimeouts.set(roomCode, timeoutId);
  }

  console.log('Client disconnected');
});


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.get('/canvas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rajzolas/rajzuj.html')));


async function getRooms() {
  fetchData('get-lobby')
  .then((responseData) => {
    // Add started status to each room in the lobby data
    if (responseData && Array.isArray(responseData.data)) {
      responseData.data.forEach(room => {
        room.started = !!roomStarted.get(room.code);
      });
    }
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
}});

// Broadcast player list and ready status to all clients in the room
function broadcastRoomPlayers(roomCode) {
  if (!rooms.has(roomCode) || !roomPlayers.has(roomCode)) return;
  const clients = rooms.get(roomCode);
  const playersArr = roomPlayers.get(roomCode);
  const hostId = String(roomHosts.get(roomCode) || "");
  const players = playersArr.map(p => ({ name: p.name, userId: String(p.userId) }));
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'room-players',
        players,
        hostId
      }));
    }
  });
}
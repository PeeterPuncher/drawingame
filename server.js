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
const roomRequiredDrawers = new Map(); // Map<roomCode, Set<userId>>
const roomActiveDrawers = new Map();   // Map<roomCode, Set<userId>>
const roomRoundTimers = new Map();     // Map<roomCode, Timeout>

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
    
          console.log(`Created room ${roomCode}`); // Log the action
          ws.send(JSON.stringify({ type: 'room-created', data: { ...responseData, roomCode} }));
          getRooms();
        });
    }
    else if (data.type === 'join-room') {
      const roomCode = data.room_code;
      const username = data.username;
      const userId = String(data.userId);

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
////////////////////////////////////////////////////////////////////////////////////////////
    else if (data.type === 'drawing-enabled') {
      const roomCode = ws.roomCode;
      const userId = String(data.userId);
      const word = data.word;

      // --- Mark all current players as eligible to draw for this round
      roomActiveDrawers.set(roomCode, new Set());
      roomRequiredDrawers.set(roomCode, null); // Not finalized yet

      // Start a timer for the round (30s)
      if (roomRoundTimers.has(roomCode)) {
        clearTimeout(roomRoundTimers.get(roomCode));
      }
      roomRoundTimers.set(roomCode, setTimeout(() => {
        // At timer end, finalize eligible drawers
        const active = roomActiveDrawers.get(roomCode) || new Set();
        // Add anyone who saved (uploaded) even if not in active
        if (roomUploads.has(roomCode)) {
          for (const uid of roomUploads.get(roomCode)) {
            active.add(uid);
          }
        }
        roomRequiredDrawers.set(roomCode, new Set(active));
        // After timer, check if all required have uploaded
        const required = Array.from(roomRequiredDrawers.get(roomCode));
        const uploaded = roomUploads.has(roomCode) ? Array.from(roomUploads.get(roomCode)) : [];
        const allUploaded = required.length > 0 && required.every(uid => uploaded.includes(uid));
        if (allUploaded) {
          const round = roomRounds.get(roomCode) || 1;
          const clients = rooms.get(roomCode);
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'all-images-uploaded',
                redirectUrl: `https://gamedb.alwaysdata.net/room/${roomCode}?round=${round}`
              }));
            }
          });
          roomRequiredDrawers.set(roomCode, null);
          roomActiveDrawers.set(roomCode, new Set());
          roomUploads.set(roomCode, new Set());
        }
      }, 30000));

      // Send the word to all clients in the room
      const clients = rooms.get(roomCode);
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'drawing-enabled', word }));
        }
      });
    }

    else if (data.type === 'save-drawing') {
      const imageData = data.imageFile;
      const roomCode = data.room_code;
      const userId = String(data.userId);
      const round = roomRounds.get(roomCode) || 1;

      // --- Mark this user as active (touched canvas or saved) ---
      if (!roomActiveDrawers.has(roomCode)) roomActiveDrawers.set(roomCode, new Set());
      roomActiveDrawers.get(roomCode).add(userId);

      // Save drawing to PHP backend, pass round info
      fetchData('save-drawing', { image: imageData, room_code: roomCode, userId: userId, round: round })
        .then((responseData) => {
          console.log('Drawing saved:', responseData);

          // Track uploads per room
          if (!roomUploads.has(roomCode)) roomUploads.set(roomCode, new Set());
          roomUploads.get(roomCode).add(userId);

          // Only check for required drawers if finalized (i.e., after timer)
          const requiredDrawersSet = roomRequiredDrawers.get(roomCode);
          if (requiredDrawersSet && requiredDrawersSet instanceof Set) {
            const requiredDrawers = Array.from(requiredDrawersSet);
            const uploadedUserIds = Array.from(roomUploads.get(roomCode));
            let allUploaded = false;
            if (requiredDrawers.length > 0) {
              allUploaded = requiredDrawers.every(uid => uploadedUserIds.includes(uid));
            }
            // If all required have uploaded, end round
            if (allUploaded) {
                // Clear timer if still running
                if (roomRoundTimers.has(roomCode)) {
                  clearTimeout(roomRoundTimers.get(roomCode));
                  roomRoundTimers.delete(roomCode);
                }
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
                roomRequiredDrawers.set(roomCode, null);
                roomActiveDrawers.set(roomCode, new Set());
                roomUploads.set(roomCode, new Set());
            }
          }
          // else: do not end round until timer finalizes required drawers

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

        // Broadcast that the user left after a grace period
        const timeoutId = setTimeout(() => {
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-left',
                data: { room_code: roomCode, user: username }
              }));
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

    // Remove from player list
    if (roomPlayers.has(roomCode)) {
      const arr = roomPlayers.get(roomCode);
      const idx = arr.findIndex(p => p.name === username);
      if (idx !== -1) arr.splice(idx, 1);
    }

    // Indíts egy törlési időzítőt, de ne végezd el az adatbázis törlést azonnal!
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
              getRooms(); // frissítsd a lobby állapotot
            }
          });
        })
        .catch(console.error);

      // Törölheted a szobából, ha már üres (vagy esetleg csak offline státusz kerül beállításra)
      if (roomClients.size === 0) {
        // Itt lehet a szoba törlését is késleltetni, vagy csak offline-ra állítani
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
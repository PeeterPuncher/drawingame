const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const baseUrl = 'https://gamedb.alwaysdata.net';
const port = 3000;

server.listen(port, () => {
  console.log(`Server running on 3 redbulls and prayers, please be patient...`);
});



app.use(express.static('public'));

function generateRoomCode() {
  let roomCode = Math.floor(10000 + Math.random() * 90000).toString();
  while (rooms.has(roomCode))
  {
    roomCode = Math.floor(10000 + Math.random() * 90000).toString();
  }
  return roomCode;
}



////////////////////////////////////////////////////////////////////////////////////////////

ws.on('close', () => {
  
});


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.get('/canvas', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rajzolas/rajzuj.html')));


async function getRooms() {
  
}
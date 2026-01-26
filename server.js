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

////////////////////////////////////////////////////////////////////////////////////////////

const Connections = new Map();

class Connection {
  static Update(id, ws) {
    const existing = Connections.get(id);
    
    if (existing) {
      existing.ws = ws;
      existing.lastPing = Date.now();
    } else {
      Connections.set(id, {
        ws: ws,
        lastPing: Date.now()
      });
    }
  }

  static Getws(id) {
    const conn = Connections.get(id);
    if (!conn) return null;

    conn.lastPing = Date.now();
    return conn.ws;
  }

  static Delete(id) {
    if (id === undefined) {
      const now = Date.now();
      // Clean up expired connections
      for (const [userId, data] of Connections) {
        if (now - data.lastPing > 600000) {
          Connections.delete(userId);
        }
      }
    } else {
      Connections.delete(id);
    }
  }
}

setInterval(() => {
  Connection.Delete()
}, 10000)

/////////////////////////////////////////////////////////////////////////////////////////////

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const userId = params.get('userId');
  if (!userId) {
    ws.close();
    return;
  }
  Connection.Update(userId, ws);

  ws.on('message', (message) => {
    message = JSON.parse(message);
    const targets = message.targets;
    const content = message.content;

    targets.forEach(targetId => {
      const targetWs = Connection.Getws(targetId);
      if (targetWs) {
        //forward content to the targets
        targetWs.send(content);
      }
      else
      {
        //return error to sender
        const senderWs = Connection.Getws(userId);
        senderWs.send(`User ${targetid} is not available`);
      }
    });
  });
});
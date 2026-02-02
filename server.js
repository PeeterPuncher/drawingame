const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3000;

server.listen(port, '0.0.0.0', () => {
    console.log(`\x1b[32m[+]\x1b[0m authenticating...`);
  setTimeout(() => {
    console.log(`\x1b[32m[+]\x1b[0m mapping the driver...`);
  }, 500);
  setTimeout(() => {
    console.log(`\x1b[31m[-]\x1b[0m server:\t\t\t| ${server.address().address}:${server.address().port}`);
  }, 1000);
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
  const protocol = req.headers.referer ? 'http' : 'ws'; // fallback for parsing
  const fullUrl = new URL(req.url, `http://${req.headers.host}`);
  const userId = fullUrl.searchParams.get('token');

  if (!userId) {
    console.log("Connection rejected: No userId provided.");
    ws.close();
    return;
  }
  Connection.Update(userId, ws);
  console.log(`${userId} connected`);
  
  ws.on('message', (data) => {
    let { type, targets, content } = JSON.parse(data);
    console.log(`Received message from ${userId}: Type=${type}, Targets=${targets}, Content=${content}`);

    const outgoingPayload = JSON.stringify({
      type: type,
      payload: {
        from: userId,
        message: content,
        timestamp: new Date()
      }
    });

    if (!targets || targets.length == 0) {
      targets = Array.from(Connections.keys()).filter(id => id);
    }

    targets.forEach(targetId => {
      const targetWs = Connection.Getws(targetId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(outgoingPayload);
      }
    });
  });

  ws.on('close', () => {
    Connection.Delete(userId);
    console.log(`User ${userId} disconnected.`);
  });
});
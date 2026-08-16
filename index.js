var crypto = require("crypto").webcrypto;
var express = require("express");
var fs = require("fs");
var http = require("http");
var moment = require("moment");
var path = require("path");
var socket = require("socket.io");
var zbase32 = require("zbase32");
var { createProxyMiddleware } = require('http-proxy-middleware');

var PRODUCTION = process.env.NODE_ENV === "production";
var STATE_FILE = process.env.STATE_FILE || "state.json";
var PORT = process.env.PORT || (PRODUCTION ? 80 : 3000);

// The welcome board: exempt from pruning, read-only, and where GET / lands.
var PINNED_ROOM = "20220402.b4t4fmyrcf";
var READONLY_ROOMS = [PINNED_ROOM];

var state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE));
} catch (err) {
  state = new Object(null);
}

var ioServer = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});
ioServer.listen(23434, '127.0.0.1')
var io = socket(ioServer);

var app = express();

app.use(createProxyMiddleware('/socket.io', {
  target: 'http://127.0.0.1:23434',
  ws: true,
}));
app.use("/node_modules", express.static(path.join(__dirname, "node_modules")));
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  // Fall back to /new if the pinned room is missing from state (e.g. fresh box).
  res.redirect(PINNED_ROOM in state ? `/${PINNED_ROOM}` : "/new");
});
app.get("/new", (req, res) => {
  const now = moment().format("YYYYMMDD");
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  const room = `${now}.${zbase32.encode(rnd)}`;
  state[room] = {
    undo: [],
    redo: [],
  };
  res.redirect(`/${room}`);
});
app.get("/up", (req, res) => {
  res.status(200).send("OK");
});
app.get("/:room", (req, res) => {
  if (!(req.params.room in state)) {
    return res.status(404).send("Not found.");
  }
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

var server = http.createServer(app);
server.listen(PORT, '0.0.0.0');

io.on("connection", (socket) => {
  const referer = socket.handshake.headers.referer;
  let url;
  try {
    url = new URL(referer);
  } catch (err) {
    console.log(`Rejected [socket=${socket.id},referer=${referer}]`);
    return socket.disconnect();
  }
  const room = url.pathname.substring(1);
  if (!(room in state)) {
    return socket.disconnect();
  }

  socket.join(room);
  console.log(`Connected [socket=${socket.id},room=${room}]`);

  const readonly = READONLY_ROOMS.includes(room);

  socket.emit("init", { ...state[room], readonly });
  socket.on("disconnect", (e) => {
    console.log(`Disconnected [socket=${socket.id},room=${room}]`);
  });
  socket.on("draw", (e) => {
    if (readonly) {
      return console.log(`Draw rejected [socket=${socket.id},room=${room}]`);
    }
    console.log(
      `Draw [socket=${socket.id},room=${room}]`
    );
    state[room].undo.push(e);
    state[room].redo = [];
    io.in(room).emit("draw", e);
  });
  socket.on("undo", () => {
    if (readonly) {
      return console.log(`Undo rejected [socket=${socket.id},room=${room}]`);
    }
    console.log(`Undo [socket=${socket.id},room=${room}]`);
    state[room].redo.push(state[room].undo.pop());
    io.in(room).emit("undo");
  });
  socket.on("redo", () => {
    if (readonly) {
      return console.log(`Redo rejected [socket=${socket.id},room=${room}]`);
    }
    console.log(`Redo [socket=${socket.id},room=${room}]`);
    state[room].undo.push(state[room].redo.pop());
    io.in(room).emit("redo");
  });
  socket.on("clear", () => {
    if (readonly) {
      return console.log(`Clear rejected [socket=${socket.id},room=${room}]`);
    }
    console.log(`Clear [socket=${socket.id},room=${room}]`);
    state[room].undo = [];
    state[room].redo = [];
    socket.to(room).emit("clear");
  });
});

function serializeState() {
  const today = moment.utc();
  const copy = {};
  for (const key of Object.keys(state)) {
    const cdate = moment.utc(key.substring(0, 8), "YYYYMMDD");
    if (key === PINNED_ROOM || today.diff(cdate, 'days') < 15) {
      copy[key] = state[key];
    }
  }
  return JSON.stringify(copy);
}

var syncInterval = setInterval(function syncToDisk() {
  const data = serializeState();
  fs.writeFile(STATE_FILE + ".tmp", data, function writeFileCb(err) {
    if (err) {
      return console.error(`Failed to persist: ${err}`);
    }
    fs.rename(STATE_FILE + ".tmp", STATE_FILE, function renameCb(err) {
      if (err) {
        return console.error(`Failed to persist: ${err}`);
      }
      console.log(`Persisted`);
    });
  });
}, seconds(30));

function shutdown(signal) {
  console.log(`Received ${signal}, flushing state`);
  clearInterval(syncInterval);
  try {
    // A distinct temp path: clearInterval cannot cancel a periodic write already
    // dispatched to the threadpool, so sharing STATE_FILE + ".tmp" would let the two
    // writers interleave. Renames onto STATE_FILE are atomic and last-one-wins.
    fs.writeFileSync(STATE_FILE + ".shutdown.tmp", serializeState());
    fs.renameSync(STATE_FILE + ".shutdown.tmp", STATE_FILE);
    console.log(`Persisted`);
  } catch (err) {
    console.error(`Failed to persist: ${err}`);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

function seconds(n) {
  return n * 1000;
}

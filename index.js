var crypto = require("crypto").webcrypto;
var express = require("express");
var fs = require("fs");
var http = require("http");
var livereload = require("livereload");
var moment = require("moment");
var path = require("path");
var socket = require("socket.io");
var zbase32 = require("zbase32");

var app = express();

var lrserver = livereload.createServer();

var server = http.createServer(app);
var io = socket(server);

var state;
try {
  state = JSON.parse(fs.readFileSync("state.json"));
} catch (err) {
  state = new Object(null);
}

app.get("/", (req, res) => {
  res.redirect("/new");
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
app.get("/:room", (req, res) => {
  if (!(req.params.room in state)) {
    return res.status(404).send("Not found.");
  }
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});
app.use("/node_modules", express.static(path.join(__dirname, "node_modules")));
app.use("/public", express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  const room = new URL(socket.handshake.headers.referer).pathname.substring(1);
  if (!(room in state)) {
    return socket.disconnect();
  }

  socket.join(room);
  console.log(`Connected [socket=${socket.id},room=${room}]`);

  socket.emit("init", state[room]);
  socket.on("disconnect", (e) => {
    console.log(`Disconnected [socket=${socket.id},room=${room}]`);
  });
  socket.on("draw", (e) => {
    console.log(
      `Draw [socket=${socket.id},room=${room}]`
    );
    state[room].undo.push(e);
    state[room].redo = [];
    io.in(room).emit("draw", e);
  });
  socket.on("undo", () => {
    console.log(`Undo [socket=${socket.id},room=${room}]`);
    state[room].redo.push(state[room].undo.pop());
    io.in(room).emit("undo");
  });
  socket.on("redo", () => {
    console.log(`Redo [socket=${socket.id},room=${room}]`);
    state[room].undo.push(state[room].redo.pop());
    io.in(room).emit("redo");
  });
  socket.on("clear", () => {
    console.log(`Clear [socket=${socket.id},room=${room}]`);
    state[room].undo = [];
    state[room].redo = [];
    socket.to(room).emit("clear");
  });
});

setInterval(function syncToDisk() {
  const today = moment.utc();
  const copy = {};
  for (const key of Object.keys(state)) {
    const cdate = moment.utc(key.substring(0, 8), "YYYYMMDD");
    if (today.diff(cdate, 'days') < 15) {
      copy[key] = state[key];
    }
  }
  fs.writeFile("state.json", JSON.stringify(copy), function writeFileCb(err) {
    if (err) throw err;
    console.log(`Persisted`);
  });
}, seconds(30));

function seconds(n) {
  return n * 1000;
}

lrserver.watch(__dirname + "/public");
server.listen(3000);

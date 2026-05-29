"use strict";

const WebSocket = require("ws");

const port = Number.parseInt(process.env.PRG32_MP_PORT || "8081", 10);
const host = process.env.PRG32_MP_HOST || "0.0.0.0";
const maxPeers = Number.parseInt(process.env.PRG32_MP_MAX_PEERS || "8", 10);

const wss = new WebSocket.Server({ host, port });
const groups = new Map();
let nextPlayerId = 1;
const signaturePattern = /^[A-Za-z0-9_.:-]{1,47}$/;

function groupFor(signature) {
  let group = groups.get(signature);
  if (!group) {
    group = new Set();
    groups.set(signature, group);
  }
  return group;
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(signature, message, except) {
  const group = groups.get(signature);
  if (!group) {
    return;
  }
  for (const ws of group) {
    if (ws !== except) {
      send(ws, message);
    }
  }
}

function leave(ws) {
  if (!ws.prg32 || !ws.prg32.signature) {
    return;
  }
  const { signature, playerId } = ws.prg32;
  const group = groups.get(signature);
  if (group) {
    group.delete(ws);
    if (group.size === 0) {
      groups.delete(signature);
    }
  }
  broadcast(signature, { type: "leave", player_id: playerId }, ws);
  ws.prg32.signature = "";
}

function activePlayerIds(group) {
  const ids = new Set();
  for (const ws of group) {
    if (ws.prg32 && ws.prg32.playerId) {
      ids.add(ws.prg32.playerId);
    }
  }
  return ids;
}

function choosePlayerId(group, requested) {
  const used = activePlayerIds(group);
  if (Number.isInteger(requested) && requested > 0 && !used.has(requested)) {
    return requested;
  }
  while (used.has(nextPlayerId) || nextPlayerId === 0) {
    nextPlayerId = (nextPlayerId + 1) >>> 0;
  }
  return nextPlayerId++;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function peerMessage(playerId, state) {
  return {
    type: "peer",
    player_id: playerId,
    x: clampNumber(state.x, -32768, 32767),
    y: clampNumber(state.y, -32768, 32767),
    sprite: clampNumber(state.sprite, 0, 65535),
    flags: clampNumber(state.flags, 0, 65535),
    input: clampNumber(state.input, 0, 0xffffffff),
    frame: clampNumber(state.frame, 0, 0xffffffff)
  };
}

function join(ws, message) {
  const signature =
    typeof message.signature === "string" ? message.signature.trim() : "";
  if (!signaturePattern.test(signature)) {
    send(ws, { type: "error", error: "invalid signature" });
    return;
  }

  leave(ws);

  const group = groupFor(signature);
  if (group.size >= maxPeers) {
    send(ws, { type: "error", error: "game room is full" });
    return;
  }

  const playerId = choosePlayerId(group, Number(message.player_id));
  ws.prg32.signature = signature;
  ws.prg32.flags = Number(message.flags) >>> 0;
  ws.prg32.playerId = playerId;
  ws.prg32.state = null;
  group.add(ws);

  send(ws, { type: "welcome", player_id: playerId });
  for (const peer of group) {
    if (peer !== ws && peer.prg32 && peer.prg32.state) {
      send(ws, peerMessage(peer.prg32.playerId, peer.prg32.state));
    }
  }
}

function updateState(ws, message) {
  if (!ws.prg32 || !ws.prg32.signature) {
    send(ws, { type: "error", error: "join first" });
    return;
  }

  const state = {
    x: message.x,
    y: message.y,
    sprite: message.sprite,
    flags: message.flags,
    input: message.input,
    frame: message.frame,
    seenAt: Date.now()
  };
  ws.prg32.state = state;
  broadcast(ws.prg32.signature, peerMessage(ws.prg32.playerId, state), ws);
}

wss.on("connection", (ws) => {
  ws.prg32 = {
    signature: "",
    flags: 0,
    playerId: 0,
    state: null
  };

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      send(ws, { type: "error", error: "invalid json" });
      return;
    }

    if (message.type === "join") {
      join(ws, message);
    } else if (message.type === "state") {
      updateState(ws, message);
    } else if (message.type === "leave") {
      leave(ws);
    } else {
      send(ws, { type: "error", error: "unknown message type" });
    }
  });

  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});

wss.on("listening", () => {
  console.log(`PRG32 multiplayer server listening on ws://${host}:${port}`);
});

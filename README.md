# PRG32 Multiplayer Server

Small Node.js WebSocket relay for PRG32 cartridge multiplayer games.

The server groups connected boards by cartridge signature. Players running the
same compatible cartridge exchange compact position/input snapshots; different
signatures stay isolated so unrelated classroom tests do not interfere with one
another.

## Run

```bash
git clone https://github.com/riscv-prg32/MultiplayerServer.git
cd MultiplayerServer
npm install
npm start
```

By default the server listens on `ws://0.0.0.0:8081`. Override the bind address,
port, or room size with environment variables:

```bash
PRG32_MP_HOST=0.0.0.0 PRG32_MP_PORT=8081 PRG32_MP_MAX_PEERS=8 npm start
```

Point the PRG32 firmware at the classroom host in `main/prg32_config.h`:

```c
#define PRG32_MULTIPLAYER_SERVER_URL "ws://192.168.4.2:8081"
```

## Protocol

Clients send JSON messages:

```json
{"type":"join","signature":"pong-v1","flags":1,"player_id":123}
{"type":"state","x":120,"y":80,"sprite":0,"flags":0,"input":2,"frame":42}
{"type":"leave"}
```

The server replies with:

```json
{"type":"welcome","player_id":123}
{"type":"peer","player_id":456,"x":128,"y":80,"sprite":0,"flags":0,"input":0,"frame":42}
{"type":"leave","player_id":456}
```

Only clients with the same `signature` receive each other's snapshots.
Signatures may contain letters, digits, `_`, `-`, `.`, and `:`, up to 47
characters.

## Environment

- `PRG32_MP_HOST`: bind address, default `0.0.0.0`
- `PRG32_MP_PORT`: WebSocket port, default `8081`
- `PRG32_MP_MAX_PEERS`: maximum clients per cartridge signature, default `8`

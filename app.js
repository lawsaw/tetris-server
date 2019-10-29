const APP = require('express')();
const SERVER = require('http').createServer(APP);
const IO = require('socket.io')(SERVER);
const PORT = process.env.PORT || 3005;

// app.get('/', function(req, res){
//     res.sendFile(__dirname + '/index.html');
// });

const SOCKET_TO             = 'CLIENT';
const SOCKET_FROM           = 'SERVER';
const EMIT_INIT             = 'INIT';
const EMIT_LOG              = 'LOG';
const EMIT_MESSAGE          = 'MESSAGE';
const EMIT_START            = 'START';
const EMIT_GAME             = 'GAME';
const EMIT_LEAVE_SESSION    = 'LEAVE SESSION';
const ON_PLAYER_UPDATE      = 'PLAYER UPDATE';
const ON_HOST_FIND          = 'HOST FIND';
const ON_GAME               = 'GAME';
const ON_LEAVE_SESSION      = 'LEAVE SESSION';

class Lobby {
    constructor() {
        this.data = {};
    }
    add(id) {
        this.data[id] = {};
    }
    del(id) {
        let opponent = this.data[id].opponent;
        this.delOpponents(id, opponent);
        // if(opponent) {
        //     console.log('deleter opponent ' + opponent);
        // }
        delete this.data[id];
        //console.log('user deleted ' + id);
    }
    mod(id, data) {
        this.data[id] = {...this.data[id], ...data}
    }
    setOpponents(player1, player2) {
        this.data[player1].opponent = player2;
        this.data[player2].opponent = player1;
    }
    delOpponents(...playerIds) {
        playerIds.forEach(playerId => {
            if(this.data[playerId] && this.data[playerId].opponent) {
                delete this.data[playerId].table;
                delete this.data[playerId].preview;
                delete this.data[playerId].score;
                delete this.data[playerId].opponent;
            }
        });
    }
    get store() {
        return this.data;
    }
};

let lobby = new Lobby();

IO.on('connection', socket => {

    //console.log('a user connected ' + socket.id);

    lobby.add(socket.id);

    IO.to(socket.id).emit(SOCKET_TO, {
        type: EMIT_INIT,
        id: socket.id,
    });

    socket.on('disconnect', () => {
        lobby.del(socket.id);
    });

    socket.on(SOCKET_FROM, ({ type, ...props }) => {
        const { id } = props;
        let opponent = lobby.store[socket.id].opponent;
        switch(type) {
            case ON_PLAYER_UPDATE:
                lobby.mod(id, {...props});
                IO.emit(SOCKET_TO, {
                    type: EMIT_LOG,
                    ...lobby.store,
                });
                break;
            case ON_HOST_FIND:
                let { host } = props;
                if(!IO.sockets.sockets[host]) {
                    IO.to(id).emit(SOCKET_TO, {
                        type: EMIT_MESSAGE,
                        messageType: 'error',
                        message: `Player with id ${host} is not found`,
                    });
                    return false;
                }
                if(socket.id === host) {
                    IO.to(id).emit(SOCKET_TO, {
                        type: EMIT_MESSAGE,
                        messageType: 'error',
                        message: `You can't invite yourself :)`,
                    });
                    return false;
                }
                if(lobby.store[id].opponent || lobby.store[host].opponent) {
                    IO.to(id).emit(SOCKET_TO, {
                        type: EMIT_MESSAGE,
                        messageType: 'error',
                        message: `Player ${lobby.store[host].nickname} with id ${host} is already in some game`,
                    });
                    return false;
                }
                lobby.setOpponents(id, host);
                IO.to(host).emit(SOCKET_TO, {
                    type: EMIT_MESSAGE,
                    messageType: 'info',
                    message: `Player ${lobby.store[id].nickname} joined`,
                });
                IO.to(id).emit(SOCKET_TO, {
                    type: EMIT_MESSAGE,
                    messageType: 'info',
                    message: `Player ${lobby.store[host].nickname} accepted`,
                });
                IO.to(host).emit(SOCKET_TO, {
                    type: EMIT_START,
                    opponent: {...lobby.store[id]},
                });
                IO.to(id).emit(SOCKET_TO, {
                    type: EMIT_START,
                    opponent: {...lobby.store[host]},
                });
                break;
            case ON_GAME:
                //const { isFinish, table, score } = props;
                if(!lobby.store[opponent]) {
                    IO.to(socket.id).emit(SOCKET_TO, {
                        type: EMIT_LEAVE_SESSION,
                    });
                    IO.to(socket.id).emit(SOCKET_TO, {
                        type: EMIT_MESSAGE,
                        messageType: 'error',
                        message: `You became alone at this session`,
                    });
                }
                lobby.mod(socket.id, props);
                IO.to(opponent).emit(SOCKET_TO, {
                    type: EMIT_GAME,
                    ...props
                });
                break;
            case ON_LEAVE_SESSION:
                let opp = lobby.store[socket.id].opponent;
                IO.to(socket.id).emit(SOCKET_TO, {
                    type: EMIT_MESSAGE,
                    messageType: 'info',
                    message: `You left session with player ${lobby.store[opp].nickname}`,
                });
                IO.to(socket.id).emit(SOCKET_TO, {
                    type: EMIT_LEAVE_SESSION,
                });
                if(opp) {
                    IO.to(opp).emit(SOCKET_TO, {
                        type: EMIT_MESSAGE,
                        messageType: 'info',
                        message: `Player ${lobby.store[socket.id].nickname} has left your session`,
                    });
                    IO.to(opp).emit(SOCKET_TO, {
                        type: EMIT_LEAVE_SESSION,
                    });
                }
                lobby.delOpponents(socket.id, opp);
                break;
            case '5':
                break;
        }
    });

});

SERVER.listen(PORT, () => {
    console.log('listening on *:' + PORT);
});

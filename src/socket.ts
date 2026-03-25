import { io, Socket } from "socket.io-client";

const socket: Socket = io("https://blitztalk-server.onrender.com/", {
  transports: ["websocket"],
});

export default socket;
// import { io } from "socket.io-client";

// const socket = io("http://localhost:3000");

// export default socket;

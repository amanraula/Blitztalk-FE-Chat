import { io, Socket } from "socket.io-client";

const socket: Socket = io("https://blitztalk-server.onrender.com/", {
  transports: ["websocket"],
});

// const socket: Socket = io("http://localhost:3000", {
//   transports: ["websocket"],
// });

export default socket;


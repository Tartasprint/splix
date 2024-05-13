import { Client } from "./api/client.ts";
import { Direction } from "./api/structs.ts";
import { WebSocketServer, WebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
const server = new WebSocketServer(7979);



server.on("connection", (client: WebSocketClient) => {
    let gameclient = new Client( (getObservation: () => string,sendDir) => {
        setInterval(()=>{
            client.send(getObservation())
        },83);
        client.on('message', message => {
            if(message === "u") sendDir(Direction.Up);
            else if(message === "d") sendDir(Direction.Down);
            else if(message === "l") sendDir(Direction.Left);
            else if(message === "r") sendDir(Direction.Right);
            else if(message === "p") sendDir(Direction.Pause);
        });
    });
});
import { Client } from "./api/client.ts";
import { ClientState, Direction } from "./api/structs.ts";
import { WebSocketServer, WebSocketClient } from "https://deno.land/x/websocket@v0.1.4/mod.ts";
const server = new WebSocketServer(7979);

let client_count = 0;

server.on("connection", (client: WebSocketClient) => {
    client_count+=1;
    const obs_interval = [0]
    const gameclient = new Client(
        (getObservation,sendDir) => {
            obs_interval[0]=setInterval(()=>{
                const observation = gameclient.getObservation();
                if(observation !== null){
                    client.send(observation)
                }
            },166);
            client.on('message', message => {
                let sent = false;
                if(message === "u") sent=sendDir(Direction.Up);
                else if(message === "d") sent=sendDir(Direction.Down);
                else if(message === "l") sent=sendDir(Direction.Left);
                else if(message === "r") sent=sendDir(Direction.Right);
                else if(message === "p") sent=sendDir(Direction.Pause);
                if(sent===false) gameclient.log('!!! Message not sent:', message);
                else gameclient.log('!!!v Message sent:', message);
            });
        },
        () => {
            const obs = gameclient.getObservation(true)
            if(obs !== null){
                clearInterval(obs_interval[0])
                client.send(obs)
                console.log('sending observation')
            }
            
            setTimeout(()=>{
                client.close(1000);
                console.log('Server@Closing client', client_count)
            },1000)
        },
        () => {
            client.send('READY');
        },
        client_count,
    );
    client.on('close', () => {
        clearInterval(obs_interval[0])
        if(
            gameclient.state == ClientState.PREPARING
            || gameclient.state == ClientState.PLAYING){
                gameclient.onClose();
        console.log(32)
        }
    });
});
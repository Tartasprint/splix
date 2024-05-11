import asyncio
import websockets
import json
async def hello():
    surroundings= []
    n=0
    uri = "ws://localhost:7979"
    async with websockets.connect(uri) as websocket:
        await websocket.send("p")
        async for message in websocket:
            surroundings=json.loads(message)
            n+=1
            if n < 50:
                await websocket.send('p')
            else:
                N=(n-50)
                if N%(2*4) == 0:
                    await websocket.send('uldru'[(N//(2*4))%5])
            print(surroundings)

if __name__ == "__main__":
    asyncio.run(hello())
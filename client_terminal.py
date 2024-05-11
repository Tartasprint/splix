import asyncio
import websockets

import asyncio

import websockets


async def hello():
    uri = "ws://localhost:8000"
    async with websockets.connect(uri) as websocket:
        id = await websocket.recv()
        

if __name__ == "__main__":
    asyncio.run(hello())
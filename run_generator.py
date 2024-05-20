from client.env import Env
from dqn.mine.data_retreive import PlayingAgent
import asyncio
asyncio.run(PlayingAgent().run())
from client.env import Env
from dqn.mine.train_agent import run
import asyncio

if __name__ == '__main__':
    asyncio.run(run())
from collections import deque
from client.env import Env
import numpy as np
from keras.src.saving.saving_lib import load_model
import tensorflow as tf
import random
import pickle
import asyncio
import websockets
import io
import itertools
import types

from dqn.mine.modified_tensorboard import ModifiedTensorBoard
from dqn.mine.stats import Stats
MODEL_NAME = '2x256'

# Environment settings
EPISODES = 1000

#  Stats settings
AGGREGATE_STATS_EVERY = 5  # episodes

LISTEN_STATE = types.SimpleNamespace()
LISTEN_STATE.RESTING = 0
LISTEN_STATE.STOPPED = 1
LISTEN_STATE.BROKEN= 2


class Communicator:
    def __init__(self, agent: 'PlayingAgent'):
        self.websocket = None
        self.agent = agent
        self.data_lock = asyncio.Lock()
        self.listener = None
        self.ready = asyncio.Event()
    
    def start(self):
        self.listener = asyncio.create_task(self.listen())

    def stop(self):
        if self.listener is None:
            return
        self.listener.cancel()

    async def listen(self):
        async with websockets.connect(
                'ws://hercule.local:8091',
                compression=None,
                user_agent_header=None,
                open_timeout=None,
                read_limit=100_000_000, write_limit=100_000_000, max_size=100_000_000,
                ) as websocket:
            self.websocket=websocket    
            state = await self.listen_loop()
            match state:
                case LISTEN_STATE.RESTING:
                    print('Got a problem. Listener shouldn\'t be resting by now.')
                case LISTEN_STATE.BROKEN | LISTEN_STATE.STOPPED:
                    pass
                case unkown:
                    print('Unknown state:', unkown)
    async def listen_loop(self):
        state = 0
        while state != LISTEN_STATE.STOPPED and state != LISTEN_STATE.BROKEN:
            try:
                message = await self.websocket.recv()
            except websockets.ConnectionClosedOK:
                print('Got a problem. State is not stopped:', state)
            except websockets.ConnectionClosedError as error:
                print('Got a problem. State is not stopped:', state, '. Error :', error)
            if message == 'FULL_UPDATE' and state == LISTEN_STATE.RESTING:
                try:
                    model_message = await self.websocket.recv()
                except websockets.ConnectionClosed as error:
                    print('Got a problem. I was waiting for the model. Error:', error)
                    state=LISTEN_STATE.BROKEN
                    break
                try:
                    vars_message = await self.websocket.recv()
                except websockets.ConnectionClosed as error:
                    print('Got a problem. I was waiting for the vars. Error:', error)
                    state=LISTEN_STATE.BROKEN
                    break
                async with self.data_lock:
                    async with self.agent.data_locker:
                        self.load_model(model_message)
                        self.load_vars(vars_message)
                    self.ready.set()
                    self.ready.clear()
                    self.update_needed = True
            elif message == 'STOP':
                state = LISTEN_STATE.STOPPED
                break
        return state

    def load_model(self, message):
        with io.BytesIO(message) as f:
            self.model = load_model(f)
    def load_vars(self, message):
        self.episode,self.epsilon = pickle.loads(message)
    
    async def send_experience(self, steps):
        if self.websocket is None: return
        await self.websocket.send('NEW_STEPS')
        await self.websocket.send(pickle.dumps([steps]))
        await self.websocket.send(pickle.dumps(self.agent.stats))
    
    async def update_agent(self):
        async with self.data_lock:
            if self.update_needed:
                self.update_needed = False
                async with self.agent.data_locker:
                    self.agent.model = tf.keras.models.clone_model(self.model)
                    self.agent.epsilon = self.epsilon
                    self.agent.episode = self.episode


class PlayingAgent:
    def __init__(self):
        # Main model
        self.model = None
        self.epsilon = None
        self.episode = None
        self.stats = Stats(-1, None)
        self.data_locker = asyncio.Lock()
        self.finished = False
        self.runner=None
        self.comm = Communicator(self)

    async def run(self):
        
        # For more repetitive results
        random.seed(1)
        np.random.seed(1)
        tf.random.set_seed(1)

        self.comm.start()
        await self.comm.ready.wait()
        print('Communication established !')
        time_errors=deque(maxlen=100)
        # Iterate over experiences
        for experience in itertools.count(start=0):
            self.experience = experience

            # Some waiting is needed to get a connection to splix.io
            await asyncio.sleep(10)
            
            # Update model, epsilon and episode
            await self.comm.update_agent()
            
            # Get new experience
            steps,experience_reward,missed_stat = await Env(self.model,200,self.epsilon, logging=False, gui=False, time_errors=time_errors).run()
            
            self.stats.put_experience(missed_stat,steps,experience_reward)
            print('Experience:', self.experience,'\tNew steps:', len(steps), '\tEpsilon:', self.epsilon, '\tReward:', experience_reward)
            
            # Send the new experience to the trainer
            await self.comm.send_experience(steps)

if __name__ == '__main__':
    asyncio.run(PlayingAgent().start())
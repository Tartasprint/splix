import io
import asyncio, os, time, random, pickle
from collections import deque
from concurrent.futures import ProcessPoolExecutor

from minio import Minio
import websockets
from tqdm import tqdm

import numpy as np
import tensorflow as tf
from keras.src.models import Sequential
from keras.src.saving.saving_lib import save_model, load_model

import keras_lmu


def prep_model(model,episode):
    for (current_state, action, reward, new_current_state, done) in episode[:-1]:
        model.predict(current_state, verbose=0)
def prep_target(target_model,episode):
    for (current_state, action, reward, new_current_state, done) in episode[:-1]:
        target_model.predict(new_current_state, verbose=0)

from dqn.mine import config
from dqn.mine.model import create_model
from dqn.mine.modified_tensorboard import ModifiedTensorBoard
from dqn.mine.stats import Stats

DISCOUNT = 0.99
REPLAY_MEMORY_SIZE = 50_000  # How many last steps to keep for model training
MIN_REPLAY_MEMORY_SIZE = 200  # Minimum number of steps in a memory to start training
MIN_EXPERIENCE_PER_EPISODE_SIZE = 2  # Minimum number of steps in a memory to start training
MINIBATCH_SIZE = 64  # How many steps (samples) to use for training
UPDATE_TARGET_EVERY = 5  # Terminal states (end of episodes)
MODEL_NAME = '2x256'
MIN_REWARD = -200  # For model save
MEMORY_FRACTION = 0.20
TIME_STEPS=15

# Environment settings
EPISODES = 20000

# Exploration settings
EPSILON_DECAY = 0.99975
MIN_EPSILON = 0.001

#  Stats settings
AGGREGATE_STATS_EVERY = 5  # episodes
SHOW_PREVIEW = False

# Memory fraction, used mostly when trai8ning multiple agents
#gpu_options = tf.GPUOptions(per_process_gpu_memory_fraction=MEMORY_FRACTION)
#backend.set_session(tf.Session(config=tf.ConfigProto(gpu_options=gpu_options)))



class Communicator:
    def __init__(self,agent: 'DQNAgent', uri: str, port: int, stats: Stats, epsilon, episode, minioexp =None):
        self.agent = agent
        self.workers: list[websockets.WebSocketServerProtocol] = []
        self.newsteps = 0
        self.steplock = asyncio.Lock()
        self.server_task = None
        self.server_stop = asyncio.Future()
        self.got_one_connection = asyncio.Event()
        self.ready_to_train = asyncio.Event()
        self.stats = stats
        self.uri = uri
        self.port = port
        self.epsilon = epsilon
        self.episode = episode
        self.minioexperience = minioexp if minioexp is not None else 0
        self.minio = Minio("192.168.1.133:9004",
            access_key="GbuMXO4jtXDUnzZCQzTl",
            secret_key="9DVaBW8gHXyUHam0vQpeIpVV2DbJNq2cs3HNBMDA",
            secure=False,
        )

    def start(self):
        self.server_task = asyncio.create_task(self.communicate())
    
    async def stop(self):
        tqdm.write('STOPPING COMS')
        websockets.broadcast(self.workers,'STOP')
        self.server_stop.set_result(None)
        await self.server_task

    def send_minio(self, experience, n):
        self.minio.put_object(
            bucket_name='splix',
            object_name=str(n).rjust(5,'0'),
            data=io.BytesIO(experience),
            length=len(experience),
        )
    def get_minio(self, n):
        try:
            response = self.minio.get_object(
                bucket_name='splix',
                object_name=str(n).rjust(5,'0'),
            )
            experience=pickle.loads(response.read())
        finally:
            response.close()
            response.release_conn()
        return experience
    
    async def communicate(self):
        async with websockets.serve(
            self.handle_connection,
            self.uri, self.port,
            read_limit=100_000_000, write_limit=100_000_000, max_size=100_000_000,
            ping_timeout=None
            ):
            await self.server_stop
    
    async def handle_connection(self,socket: websockets.WebSocketServerProtocol):
        self.workers.append(socket)
        tqdm.write('New connection')
        self.got_one_connection.set()
        await self.broadcast_update()
        tqdm.write('Listening for new steps.')
        async for message in socket:
            if message == 'NEW_STEPS':
                tqdm.write('RECEIVING NEW STEPS')
                try:
                    newsteps = await socket.recv()
                    newstats = await socket.recv()
                except:
                    tqdm.write('Bouh....')
                    break
                async with self.steplock:
                    self.send_minio(newsteps,self.minioexperience)
                    self.minioexperience+=1
                    self.newsteps+=1
                    self.minioexperience%=20000
                    if self.minioexperience >= MIN_REPLAY_MEMORY_SIZE and self.newsteps >= MIN_EXPERIENCE_PER_EPISODE_SIZE:
                        self.ready_to_train.set()
                    self.stats.aggregate(pickle.loads(newstats))
        if len(self.workers) == 0:
            self.got_one_connection.clear()
    async def broadcast_update(self):
        model = self.agent.serialize_model()
        tqdm.write(f'LEN {len(model)}')
        vars = pickle.dumps((self.episode,self.epsilon))
        async def send(worker: websockets.WebSocketServerProtocol):
            try:
                await worker.send('FULL_UPDATE')
                CHUNK_SIZE=100
                await worker.send((model[i:i+CHUNK_SIZE] for i in range(0, len(model),CHUNK_SIZE)))
                await worker.send(vars)
            except: pass
        async with asyncio.TaskGroup() as tg:
            for worker in self.workers:
                tg.create_task(send(worker))
        return
    

# Agent class
class DQNAgent:
    def __init__(self,model=None):

        # Main model
        self.model: Sequential = create_model() if model is None else model

        # Target network
        self.target_model = tf.keras.models.clone_model(self.model)

        # An array with last n steps for training
        self.replay_memory = []

        # Custom tensorboard object
        self.tensorboard = ModifiedTensorBoard(MODEL_NAME,log_dir="logs/{}-{}".format(MODEL_NAME, int(time.time())))

        # Used to count when to update target network with main network's weights
        self.target_update_counter = 0

    # Adds step's data to a memory replay array
    # (observation space, action, reward, new observation space, done)
    async def update_replay_memory(self, comm: Communicator):
        async with comm.steplock:
            m=comm.minioexperience-1
            comm.newsteps=0
        self.replay_memory=[]
        for n in random.sample(range(m),MINIBATCH_SIZE):
            await asyncio.sleep(0)
            self.replay_memory.append(comm.get_minio(n))

    # Trains main network every step during episode
    async def train(self, pool: ProcessPoolExecutor):
        # Start training only if certain number of samples is already saved
        if len(self.replay_memory) < MINIBATCH_SIZE:
            return

        for episode in tqdm(self.replay_memory, total=MINIBATCH_SIZE, position=1, unit='experience'):
            await asyncio.sleep(0)
            self.model.get_layer(index=0).reset_state()
            self.target_model.get_layer(index=0).reset_state()
            if len(episode) == 0: continue
            stop = random.randint(1, len(episode)+1)
            episode = episode[:stop]
            
            prep_model(self.model,episode)
            await asyncio.sleep(0)
            prep_target(self.target_model,episode)
            await asyncio.sleep(0)
            # Get current states from minibatch, then query NN model for Q values
            current_state, action, reward, new_current_state, done = episode[-1]
            current_state = episode[-1][0]
            current_qs = self.model.predict(current_state, verbose=0)
            await asyncio.sleep(0)
            # Get future states from minibatch, then query NN model for Q values
            # When using target network, query it, otherwise main network should be queried
            new_current_state = episode[-1][3]
            future_qs = self.target_model.predict(new_current_state, verbose=0)
            await asyncio.sleep(0)
            X = []
            y = []
            # If not a terminal state, get new q from future states, otherwise set it to 0
            # almost like with Q Learning, but we use just part of equation here
            if not done:
                max_future_q = np.max(future_qs)
                new_q = reward + DISCOUNT * max_future_q
            else:
                new_q = reward

            # Update Q value for given state
            current_qs[0,action] = new_q

            # And append to our training data
            current_state
            y.append(current_qs)
            # Fit on all samples as one batch, log only on terminal state
            self.model.fit(current_state, current_qs, batch_size=1, verbose=0, shuffle=False, callbacks=[self.tensorboard])
            await asyncio.sleep(0)
        # Write onto target
        self.tensorboard.write_on_i_want()
        # Update target network counter every episode
        if True: # BUG
            self.target_update_counter += 1
        # If counter reaches set value, update target network with weights of main network
        if self.target_update_counter > UPDATE_TARGET_EVERY:
            self.target_model.set_weights(self.model.get_weights())
            self.target_update_counter = 0

    def serialize_model(self) -> bytes:
        #with io.BytesIO() as the_bytes:
        #    save_model(self.model, the_bytes)
        #    b =the_bytes.read()
        #with io.BytesIO(b) as f:
        #    load_model(f)
        return pickle.dumps(self.model)
    # Queries main network for Q values given current observation space (environment state)
    def get_qs(self, state):
        return self.model.predict(np.array(state).reshape(-1, *state.shape)/255)[0]

async def ainput(prompt=''):
    tqdm.write(prompt)
    return await asyncio.to_thread(input)

async def console(comm: Communicator):
    global running
    while True:
        i=await ainput('Write STOP')
        if i == 'STOP':
            tqdm.write('Stopping...')
            running=False
            comm.ready_to_train.set()
            break


async def run():
    global running
    running=True
    # Create models folder
    model=None
    epsilon = 1  # not a constant, going to be decayed
    last_episode = 0
    minioexp=None
    if not os.path.isdir('models'):
        os.makedirs('models')
        model = create_model()
        exmem = None
    else:
        model=tf.keras.models.load_model('models/model.keras')
        tqdm.write('MODEL LOADED')
        with open('models/training_vars.pkl', 'rb') as file:   
            # Call load method to deserialze 
            epsilon,last_episode,minioexp = pickle.load(file)
        with open('models/steps.pkl', 'rb') as file:   
            # Call load method to deserialze 
            exmem = pickle.load(file)
        tqdm.write(f'VARS LOADED eps:{epsilon}, episode:{last_episode}, exp:{minioexp}')
    model.summary()
    agent = DQNAgent(model)
    comm = Communicator(
        agent,
        config.TRAINER_URI, config.TRAINER_PORT,
        Stats(config.STATS_EVERY, agent.tensorboard),
        epsilon,
        last_episode,
        minioexp,
        )
    process_pool = ProcessPoolExecutor()
    if exmem is not None:
        agent.replay_memory = exmem
    # For more repetitive results
    random.seed(1)
    np.random.seed(1)
    tf.random.set_seed(1)

    comm.start()
    asyncio.create_task(console(comm))
    # Iterate over episodes
    for episode in tqdm(range(last_episode+1, EPISODES+1), ascii=True, unit='episodes',position=0):
        # Update tensorboard step every episode
        agent.tensorboard.step = episode
        comm.epsilon=epsilon
        comm.episode=episode
        towait = max(MIN_REPLAY_MEMORY_SIZE-comm.newsteps-comm.minioexperience,MIN_EXPERIENCE_PER_EPISODE_SIZE-comm.newsteps)
        if towait > 0:
            with tqdm(total=towait, desc='Waiting for new steps', position=1) as pbar:
                while True:
                    inc = towait - max(MIN_REPLAY_MEMORY_SIZE-comm.newsteps-comm.minioexperience,MIN_EXPERIENCE_PER_EPISODE_SIZE-comm.newsteps)
                    if inc > 0: pbar.update(inc)
                    towait -= inc
                    try:
                        await asyncio.wait_for(comm.ready_to_train.wait(),1)
                        if comm.server_task.done():
                            tqdm.write('Server was auto-stopped...')
                            break
                        if comm.ready_to_train.is_set(): break
                    except TimeoutError:
                        continue
        if not running: break
        tqdm.write('Got new steps')

        # Get new steps
        await agent.update_replay_memory(comm)
        tqdm.write('Training')
        await agent.train(process_pool)
        await comm.broadcast_update()

        agent.model.save('models/model.keras', overwrite=True)
        with open('models/training_vars.pkl', 'wb') as file:             
            # A new file will be created 
            async with comm.steplock:
                pickle.dump((epsilon,episode,comm.minioexperience), file)
        with open('models/steps.pkl', 'wb') as file:             
            # A new file will be created
            pickle.dump(agent.replay_memory, file) 
        # Send stats to Tensorboard
        comm.stats.compile(epsilon)

        if not running:
            break

        # Decay epsilon
        if epsilon > MIN_EPSILON:
            epsilon *= EPSILON_DECAY
            epsilon = max(MIN_EPSILON, epsilon)
    await comm.stop()
    process_pool.shutdown()
    print('Stopped successfuly')
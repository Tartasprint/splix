from client.env import Env
import numpy as np
from tensorflow.keras.models import clone_model
from tensorflow.keras.layers import Dense, Dropout, Conv2D, MaxPooling2D, Activation, Flatten
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import TensorBoard
from tensorflow.keras.saving import load_model
import tensorflow as tf
from collections import deque
import time
import random
from tqdm import tqdm
from dqn.mine.model import create_model
import pickle
import sys, os
import threading

# Disable
def blockPrint():
    sys.stdout = open(os.devnull, 'wb',)

# Restore
def enablePrint():
    sys.stdout = sys.__stdout__


DISCOUNT = 0.99
REPLAY_MEMORY_SIZE = 50_000  # How many last steps to keep for model training
MIN_REPLAY_MEMORY_SIZE = 200  # Minimum number of steps in a memory to start training
MINIBATCH_SIZE = 64  # How many steps (samples) to use for training
UPDATE_TARGET_EVERY = 5  # Terminal states (end of episodes)
MODEL_NAME = '2x256'
MIN_REWARD = -200  # For model save
MEMORY_FRACTION = 0.20
TIME_STEPS=15

# Environment settings
EPISODES = 1000

# Exploration settings
EPSILON_DECAY = 0.99975
MIN_EPSILON = 0.001

#  Stats settings
AGGREGATE_STATS_EVERY = 5  # episodes
SHOW_PREVIEW = False

# Memory fraction, used mostly when trai8ning multiple agents
#gpu_options = tf.GPUOptions(per_process_gpu_memory_fraction=MEMORY_FRACTION)
#backend.set_session(tf.Session(config=tf.ConfigProto(gpu_options=gpu_options)))

class ModifiedTensorBoard(TensorBoard):

    # Overriding init to set initial step and writer (we want one log file for all .fit() calls)
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.step = 1
        self.writer = tf.summary.create_file_writer(self.log_dir)
        self._log_write_dir = os.path.join(self.log_dir, MODEL_NAME)

    
    # Overrided, saves logs with our step number
    # (otherwise every .fit() will start writing from 0th step)
    def on_epoch_end(self, epoch, logs=None):
        self.update_stats(**logs)

    # Overrided
    # We train for one batch only, no need to save anything at epoch end
    def on_batch_end(self, batch, logs=None):
        pass

    # Overrided, so won't close writer
    def on_train_end(self, _):
        pass

    def on_train_batch_end(self, batch, logs=None):
        pass

    # Custom method for saving own metrics
    # Creates writer, writes custom metrics and closes writer
    def update_stats(self, **stats):
        self._write_logs(stats, self.step)

    def _write_logs(self, logs, index):
        with self.writer.as_default():
            for name, value in logs.items():
                tf.summary.scalar(name, value, step=index)
                self.writer.flush()# Agent class
class DQNAgent:
    def __init__(self,model=None):

        # Main model
        self.model = create_model() if model is None else model

        # Target network
        self.target_model = clone_model(self.model)

        self.locked_up = threading.Lock()
        self.finished = False

        # An array with last n steps for training
        self.replay_memory = deque(maxlen=REPLAY_MEMORY_SIZE)

        # Custom tensorboard object
        self.tensorboard = ModifiedTensorBoard(log_dir="logs/{}-{}".format(MODEL_NAME, int(time.time())))

        # Used to count when to update target network with main network's weights
        self.target_update_counter = 0

    # Adds step's data to a memory replay array
    # (observation space, action, reward, new observation space, done)
    def update_replay_memory(self, transitions):
        self.replay_memory.append(transitions)

    # Trains main network every step during episode
    def train(self, step):

        # Start training only if certain number of samples is already saved
        if len(self.replay_memory) < MIN_REPLAY_MEMORY_SIZE:
            return
        print('Training', step)

        # Get a minibatch of random samples from memory replay table
        minibatch = random.sample(self.replay_memory, MINIBATCH_SIZE)

        for episode in tqdm(minibatch, total=MINIBATCH_SIZE):
            self.model.get_layer(index=0).reset_state()
            self.target_model.get_layer(index=0).reset_state()
            if len(episode) < 2: continue
            stop = len(episode) if len(episode)<TIME_STEPS else random.randint(TIME_STEPS, len(episode)+1)
            episode = episode[:stop]
            for (current_state, action, reward, new_current_state, done) in episode[:-1]:
                self.model.predict(current_state, verbose=0)
                self.target_model.predict(new_current_state, verbose=0)
            # Get current states from minibatch, then query NN model for Q values
            current_state = episode[-1][0]
            current_qs = self.model.predict(current_state, verbose=0)
            # Get future states from minibatch, then query NN model for Q values
            # When using target network, query it, otherwise main network should be queried
            new_current_state = episode[-1][3]
            future_qs = self.target_model.predict(new_current_state, verbose=0)
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
            with self.locked_up:
                self.model.fit(current_state, current_qs, batch_size=1, verbose=0, shuffle=False, callbacks=[self.tensorboard])

        # Update target network counter every episode
        if True: # BUG
            self.target_update_counter += 1

        # If counter reaches set value, update target network with weights of main network
        if self.target_update_counter > UPDATE_TARGET_EVERY:
            self.target_model.set_weights(self.model.get_weights())
            self.target_update_counter = 0

    # Queries main network for Q values given current observation space (environment state)
    def get_qs(self, state):
        return self.model.predict(np.array(state).reshape(-1, *state.shape)/255)[0]

def run():
    os.environ['SDL_VIDEO_WINDOW_POS'] = "%d,%d" % (1200,600)
    # Create models folder
    model=None
    epsilon = 1  # not a constant, going to be decayed
    last_episode = 0
    if not os.path.isdir('models'):
        os.makedirs('models')
        model = create_model()
        exmem = None
    else:
        model=load_model(f'models/model.keras')
        print('MODEL LOADED')
        with open('models/training_vars.pkl', 'rb') as file:   
            # Call load method to deserialze 
            epsilon,last_episode = pickle.load(file)
        with open('models/steps.pkl', 'rb') as file:   
            # Call load method to deserialze 
            exmem = pickle.load(file)
        print('VARS LOADED', epsilon, last_episode)
    model.summary()
    agent = DQNAgent(model)
    if exmem is not None:
        agent.replay_memory = exmem
    
    # For more repetitive results
    random.seed(1)
    np.random.seed(1)
    tf.random.set_seed(1)

    # For stats
    ep_rewards = []
    missed_stats = np.zeros(5)
    step_stats = 0
    def train_loop():
        n=0
        while not agent.finished:
            agent.train(n)
            n+=1
    train_thread = threading.Thread(target=train_loop)
    train_thread.start()
    # Iterate over episodes
    try:
        for episode in tqdm(range(last_episode+ 1, last_episode+ EPISODES + 1), ascii=True, unit='episodes'):
            # Update tensorboard step every episode
            agent.tensorboard.step = episode

            # Restarting episode - reset episode reward and step number
            step = 1

            time.sleep(10)
            # Reset environment and get initial state
            with agent.locked_up:
                damodel= clone_model(agent.model)
            steps,episode_reward,missed_stat = Env(damodel,200,epsilon).run()
            missed_stats+=np.array(missed_stat)
            step_stats += len(steps)
            print('Episode:', episode,'\tNew steps:', len(steps), '\tEpsilon:', epsilon, '\tReward:', episode_reward)
            # Every step we update replay memory and train main network
            agent.update_replay_memory(steps)

            # Append episode reward to a list and log stats (every given number of episodes)
            ep_rewards.append(episode_reward)
            if not episode % AGGREGATE_STATS_EVERY or episode == 1:
                connection_quality=np.dot(missed_stats/np.sum(missed_stats),np.array([1,-1,-4,-9,-16]))
                average_reward = sum(ep_rewards[-AGGREGATE_STATS_EVERY:])/len(ep_rewards[-AGGREGATE_STATS_EVERY:])
                min_reward = min(ep_rewards[-AGGREGATE_STATS_EVERY:])
                max_reward = max(ep_rewards[-AGGREGATE_STATS_EVERY:])
                agent.tensorboard.update_stats(reward_avg=average_reward,
                                            reward_min=min_reward,
                                            reward_max=max_reward,
                                            epsilon=epsilon,
                                            connection_quality=connection_quality,
                                            steps_avg=step_stats/AGGREGATE_STATS_EVERY,
                                            )
                missed_stats=np.zeros_like(missed_stats)
                step_stats=0

            agent.model.save(f'models/model.keras', overwrite=True)
            with open('models/training_vars.pkl', 'wb') as file:             
                # A new file will be created 
                pickle.dump((epsilon,episode), file)
            with open('models/steps.pkl', 'wb') as file:             
                # A new file will be created 
                pickle.dump(agent.replay_memory, file) 
            # Decay epsilon
            if epsilon > MIN_EPSILON:
                epsilon *= EPSILON_DECAY
                epsilon = max(MIN_EPSILON, epsilon)
    finally:
        agent.finished = True
        train_thread.join()
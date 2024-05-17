from client.env import Env
from dqn.mine.model import create_model
from tensorflow.keras.models import load_model
print(len(Env(load_model('./models/2x256.keras'),200,0,True).run()))
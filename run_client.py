from client.env import Env
from dqn.mine.model import create_model
print(len(Env(create_model(),200,1,True).run()))
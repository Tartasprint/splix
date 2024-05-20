from client.env import Env
from dqn.mine.model import create_model
from tensorflow.keras.models import load_model
if False:
    model = create_model()
else:
    model = load_model('./models/model.keras')

print(len(Env(model,10000,0,logging=True,gui=False).run()))
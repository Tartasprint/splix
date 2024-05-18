import tensorflow.keras as keras
import keras_lmu

def create_model():
	return LMUModel()

def LMUModel():
	model = keras.Sequential()
	model.add(keras.Input(shape=(1,21*21*3), batch_size=1))
	model.add(get_lmu_layer(128,128,15,128),)
	model.add(keras.layers.Dense(128, activation='relu'))
	model.add(keras.layers.Dense(128, activation='relu'))
	model.add(keras.layers.Dense(6, activation='relu'))
	model.name = 'LMU-128-128-15-Dense-128-Dense-128-Dense-6'
	model.compile(loss="mse", optimizer=keras.optimizers.Adam(learning_rate=0.001), metrics=['accuracy'])
	return model


def get_lmu_layer(memory_d,order,theta,hidden_dim):
	layer = keras.layers.RNN(
        keras_lmu.LMUCell(
            memory_d=memory_d,
            order=order,
            theta=theta,
            hidden_cell=keras.layers.SimpleRNNCell(hidden_dim),
            hidden_to_memory=False,
            memory_to_memory=False,
            input_to_hidden=True,
        ),
		stateful = True,
    )

	layer.name = 'lmu'
	return layer
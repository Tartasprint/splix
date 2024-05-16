import tensorflow.keras as keras
def create_model():
	model = keras.Sequential([
		keras.Input((21,21,3)),
		keras.layers.Conv2D(128,3,activation='relu'),
		keras.layers.MaxPool2D(),
		keras.layers.Flatten(),
		keras.layers.Dense(128, activation='relu'),
		keras.layers.Dense(128, activation='relu'),
		keras.layers.Dense(6, activation='relu'),
	])
	model.compile(loss="mse", optimizer=keras.optimizers.Adam(learning_rate=0.001), metrics=['accuracy'])
	return model

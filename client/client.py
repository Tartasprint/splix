
import asyncio
import websockets
import json
import pygame
import collections
import colors
import time
from fix_sleep import sleep
import threading
import tensorflow as tf
import keras


class NeuralIntercom():
	def __init__(self) -> None:
		self.intercom = collections.deque(maxlen=1)
		self.received=0
	def push(self,v):
		self.intercom.append(v)
		self.received+=1
	def pop(self):
		r=self.intercom.pop(),self.received
		self.received=0
		return r
async def start_communication(model):
	global interfacing
	print('START COM')
	async with websockets.connect(uri) as websocket:
		if await websocket.recv() != 'READY':
			raise ValueError('Protocol error !')
		else:
			print('CONNECTED')
		await asyncio.gather(send_loop(websocket,model),receive_loop(websocket))
		print('DISCONNECTED')
		interfacing=False
		await websocket.close()

async def send_loop(websocket: websockets.WebSocketClientProtocol, model: keras.Sequential):
	global communicating
	n=0
	last=time.time()
	await sleep(0.350)
	try:
		await websocket.send('p')
	except websockets.exceptions.ConnectionClosed:
		communicating=False
		return
	await sleep(5)
	while communicating:
		try:
			state,n=neural_intercom.pop()
			#print('missed frames',n)
		except:
			await asyncio.sleep(0.1)
			continue
		state=json.loads(state)
		if state == '': continue
		blocks=tf.constant(state["blocks"], dtype=tf.float32, shape=(21,21))
		trails=tf.constant(state["trails"], dtype=tf.float32, shape=(21,21))
		state=tf.stack([blocks,trails],axis=2)
		state=tf.reshape(state,(1,21,21,2))
		y=tf.reshape(model.predict([state]),(6))
		y=tf.argmax(y).numpy()
		y="udlrpw"[y]
		try:
			await websocket.send(y)
		except websockets.exceptions.ConnectionClosed:
			communicating=False
			return
		new = time.time()
		print('Looped. Action:', y, '; Time:', str(int((new-last)*1000)).rjust(9))
		last=new
	print("SENDING DONE")

async def receive_loop(websocket: websockets.WebSocketClientProtocol):
	global communicating
	while communicating:
		print('YAY')
		try:
			message = await websocket.recv()
		except websockets.exceptions.ConnectionClosed:
			communicating=False
			return
		intercom.append(message)
		neural_intercom.push(message)

def pygame_interface():
	global interfacing
	global communicating
	pygame.init()
	pygame.fastevent.init()

	# screen dimensions
	HEIGHT= 420
	WIDTH = 420

	# set up the drawing window
	screen = pygame.display.set_mode([WIDTH, HEIGHT])

	color = pygame.Color('blue')
	radius = 30
	x = int(WIDTH/2)
	state=None

	n=0
	# run until the user asks to quit
	while interfacing:
		n+=1
		# did the user close the window
		for event in pygame.fastevent.get():
			if event.type == pygame.QUIT:
				interfacing = False
		try:
			newstate=intercom.pop()
			newstate=json.loads(newstate)
			if newstate != "": 
				state = newstate
		except: pass
		x = (x + 1) % (WIDTH - radius * 2) + radius
		# fill the background with white
		screen.fill((0,0,0))

		if state is not None:
			if n%10000==0:
				# printing for debug
				print(state['pos'])
			for x in range(21):
				for y in range(21):
					color = state["blocks"][21*x+y]
					if color == 0: # edge
						color = colors.COLORS["red"]["boundsDark"]
					elif color == 1:
						color = colors.COLORS["grey"]["brighter"]
					elif color >=2:
						color = colors.getColorForBlockSkinId((color-2)%13)["brighter"]
					else:
						color = "#000000"
					color=pygame.Color(color)
					pygame.draw.rect(screen, color, pygame.Rect(y*20+2,x*20+2,16,16))
			for x in range(21):
				for y in range(21):
					color = state["trails"][21*x+y]
					if color >= 0:
						color = pygame.Color(colors.getColorForBlockSkinId(color)["darker"])
						pygame.draw.circle(screen, color,(x*20+10,y*20+10), 5)
			for color,x,y in state['players']:
				if color !=-1:
					color = pygame.Color(colors.getColorForBlockSkinId(color)["darker"])
					pygame.draw.rect(screen, color, pygame.Rect(y*20+5,x*20+5,10,10))
		else:
			print("STATE IS NONE")
		# flip the display
		pygame.display.flip()
	
	communicating = False
	pygame.quit()

def game_thread(model):
	global communicating, interfacing
	async def prog():
		await asyncio.gather(
			asyncio.to_thread(pygame_interface),
			start_communication(model),
		)
	asyncio.run(prog())
	print('=======')

def run(model):
	g=threading.Thread(target=game_thread,args=(model,))
	try:
		g.start()
	except KeyboardInterrupt:
		print('QUITTING...')
		interfacing=False
		communicating=False
	g.join()

intercom = collections.deque(maxlen=1)
neural_intercom = NeuralIntercom()
communicating = True # Controls communication loop
interfacing = True # Controls pygame loop
uri = "ws://localhost:7979"


if __name__ == '__main__':
	model = keras.Sequential([
		keras.Input((21,21,2)),
		keras.layers.Conv2D(4,3,activation='relu'),
		keras.layers.MaxPool2D(),
		keras.layers.Flatten(),
		keras.layers.Dense(64, activation='relu'),
		keras.layers.Dense(6, activation='relu'),
	])
	model.compile(loss="mse", optimizer=keras.optimizers.Adam(learning_rate=0.001), metrics=['accuracy'])
	run(model)